import path from "node:path";
import fs from "node:fs";
import type BetterSqlite3 from "better-sqlite3";
import type { Pool, PoolClient, QueryResultRow } from "pg";

export interface DbExecutor {
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

export interface DatabaseAdapter extends DbExecutor {
  readonly dialect: "sqlite" | "postgres";
  transaction<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T>;
}

type SqliteDatabase = BetterSqlite3.Database;

function toPostgresSql(query: string): string {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

class SqliteExecutor implements DbExecutor {
  constructor(private readonly database: SqliteDatabase) {}

  async run(sql: string, params: unknown[] = []) {
    const result = this.database.prepare(sql).run(...params);
    return { changes: result.changes };
  }

  async get<T>(sql: string, params: unknown[] = []) {
    return this.database.prepare(sql).get(...params) as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []) {
    return this.database.prepare(sql).all(...params) as T[];
  }

  async exec(sql: string) {
    this.database.exec(sql);
  }
}

class SqliteAdapter implements DatabaseAdapter {
  readonly dialect = "sqlite" as const;
  private readonly direct: SqliteExecutor;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly database: SqliteDatabase) {
    this.direct = new SqliteExecutor(database);
    database.pragma("foreign_keys = ON");
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work, work);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  run(sql: string, params?: unknown[]) {
    return this.enqueue(() => this.direct.run(sql, params));
  }

  get<T>(sql: string, params?: unknown[]) {
    return this.enqueue(() => this.direct.get<T>(sql, params));
  }

  all<T>(sql: string, params?: unknown[]) {
    return this.enqueue(() => this.direct.all<T>(sql, params));
  }

  exec(sql: string) {
    return this.enqueue(() => this.direct.exec(sql));
  }

  transaction<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const result = await work(this.direct);
        this.database.exec("COMMIT");
        return result;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    });
  }
}

class PostgresExecutor implements DbExecutor {
  constructor(private readonly client: Pool | PoolClient) {}

  async run(sql: string, params: unknown[] = []) {
    const result = await this.client.query(toPostgresSql(sql), params);
    return { changes: result.rowCount ?? 0 };
  }

  async get<T>(sql: string, params: unknown[] = []) {
    const result = await this.client.query<QueryResultRow>(toPostgresSql(sql), params);
    return result.rows[0] as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []) {
    const result = await this.client.query<QueryResultRow>(toPostgresSql(sql), params);
    return result.rows as T[];
  }

  async exec(sql: string) {
    await this.client.query(sql);
  }
}

class PostgresAdapter implements DatabaseAdapter {
  readonly dialect = "postgres" as const;
  private readonly direct: PostgresExecutor;

  constructor(private readonly pool: Pool) {
    this.direct = new PostgresExecutor(pool);
  }

  run(sql: string, params?: unknown[]) {
    return this.direct.run(sql, params);
  }

  get<T>(sql: string, params?: unknown[]) {
    return this.direct.get<T>(sql, params);
  }

  all<T>(sql: string, params?: unknown[]) {
    return this.direct.all<T>(sql, params);
  }

  exec(sql: string) {
    return this.direct.exec(sql);
  }

  async transaction<T>(work: (tx: DbExecutor) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new PostgresExecutor(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  vault_envelope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  password_changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reauthenticated_at TEXT
);

CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS vault_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_version INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS vault_items_user_id_idx ON vault_items(user_id);
CREATE INDEX IF NOT EXISTS vault_items_deleted_at_idx ON vault_items(user_id, deleted_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  attempt_key TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS login_attempts_key_time_idx ON login_attempts(attempt_key, attempted_at);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  auto_lock_minutes INTEGER NOT NULL DEFAULT 10,
  background_lock_minutes INTEGER NOT NULL DEFAULT 5,
  clipboard_clear_seconds INTEGER NOT NULL DEFAULT 30,
  view_mode TEXT NOT NULL DEFAULT 'compact',
  sort_mode TEXT NOT NULL DEFAULT 'favorite',
  updated_at TEXT NOT NULL
);
`;

async function createAdapter(): Promise<DatabaseAdapter> {
  const databaseUrl = process.env.DATABASE_URL || "file:./data/visual-2fa.db";

  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.DATABASE_POOL_SIZE || 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    return new PostgresAdapter(pool);
  }

  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL 必须以 file:、postgres:// 或 postgresql:// 开头");
  }

  const fileValue = databaseUrl.slice("file:".length);
  const filename = fileValue === ":memory:" ? ":memory:" : path.resolve(process.cwd(), fileValue);
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const sqliteModule = await import("better-sqlite3");
  const Sqlite = sqliteModule.default;
  return new SqliteAdapter(new Sqlite(filename));
}

async function initializeDatabase() {
  const adapter = await createAdapter();
  await adapter.exec(schemaSql);
  return adapter;
}

declare global {
  var __visual2faDatabase: Promise<DatabaseAdapter> | undefined;
}

export function getDatabase(): Promise<DatabaseAdapter> {
  if (!globalThis.__visual2faDatabase) {
    globalThis.__visual2faDatabase = initializeDatabase();
  }
  return globalThis.__visual2faDatabase;
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "23505" || candidate.code === "SQLITE_CONSTRAINT_UNIQUE" || candidate.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || Boolean(candidate.message?.includes("UNIQUE constraint failed"));
}
