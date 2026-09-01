import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { DbExecutor } from "@/lib/server/database";
import { getDatabase } from "@/lib/server/database";
import { ApiError } from "@/lib/server/http";

function scrypt(
  password: string,
  salt: Uint8Array,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
export const SESSION_COOKIE = "visual2fa_session";
const OWNER_ID = "owner";
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_LENGTH = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  vault_envelope: string;
  created_at: string;
  updated_at: string;
  password_changed_at: string;
}

interface SessionJoinRow extends UserRow {
  session_id: string;
  token_hash: string;
  user_agent: string | null;
  ip_hash: string | null;
  session_created_at: string;
  last_seen_at: string;
  expires_at: string;
  reauthenticated_at: string | null;
}

export interface AuthSession {
  id: string;
  user: UserRow;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  reauthenticatedAt: string | null;
}

export function normalizeUsername(username: string): string {
  return username.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, SCRYPT_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })) as Buffer;
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [name, nValue, rValue, pValue, saltValue, hashValue] = encoded.split("$");
  if (name !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  if (expected.length !== SCRYPT_LENGTH) return false;
  try {
    const actual = (await scrypt(password, Buffer.from(saltValue, "base64url"), expected.length, {
      N: Number(nValue),
      r: Number(rValue),
      p: Number(pValue),
      maxmem: SCRYPT_MAXMEM,
    })) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requestIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function loginAttemptKey(request: NextRequest, username: string): string {
  return sha256(`${requestIp(request)}\u0000${normalizeUsername(username)}`);
}

export async function assertLoginAllowed(attemptKey: string): Promise<void> {
  const db = await getDatabase();
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const row = await db.get<{ count: number | string }>(
    "SELECT COUNT(*) AS count FROM login_attempts WHERE attempt_key = ? AND attempted_at >= ?",
    [attemptKey, cutoff],
  );
  if (Number(row?.count || 0) >= 5) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", "尝试次数过多，请 15 分钟后再试");
  }
}

export async function recordFailedLogin(attemptKey: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.run("INSERT INTO login_attempts (id, attempt_key, attempted_at) VALUES (?, ?, ?)", [randomUUID(), attemptKey, now]);
  await db.run("DELETE FROM login_attempts WHERE attempted_at < ?", [new Date(Date.now() - 24 * 60 * 60_000).toISOString()]);
}

export async function clearLoginAttempts(attemptKey: string): Promise<void> {
  const db = await getDatabase();
  await db.run("DELETE FROM login_attempts WHERE attempt_key = ?", [attemptKey]);
}

function sessionDays(): number {
  const parsed = Number(process.env.SESSION_DAYS || 7);
  return Number.isFinite(parsed) ? Math.min(30, Math.max(1, Math.floor(parsed))) : 7;
}

export async function createSession(
  executor: DbExecutor,
  request: NextRequest,
  userId = OWNER_ID,
): Promise<{ token: string; expiresAt: Date; id: string }> {
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionDays() * 24 * 60 * 60_000);
  await executor.run(
    `INSERT INTO sessions
      (id, user_id, token_hash, user_agent, ip_hash, created_at, last_seen_at, expires_at, reauthenticated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      sha256(token),
      (request.headers.get("user-agent") || "Unknown browser").slice(0, 500),
      sha256(requestIp(request)),
      now.toISOString(),
      now.toISOString(),
      expiresAt.toISOString(),
      now.toISOString(),
    ],
  );
  return { token, expiresAt, id };
}

function isSecureRequest(request: NextRequest): boolean {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProtocol === "https" || request.nextUrl.protocol === "https:";
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date, request: NextRequest): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(request),
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export function clearSessionCookie(response: NextResponse, request: NextRequest): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(request),
    path: "/",
    expires: new Date(0),
  });
}

export async function getSession(request: NextRequest, required = false): Promise<AuthSession | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (required) throw new ApiError(401, "AUTH_REQUIRED", "请先解锁保险库");
    return null;
  }
  const db = await getDatabase();
  const now = new Date();
  const row = await db.get<SessionJoinRow>(
    `SELECT
      s.id AS session_id, s.token_hash, s.user_agent, s.ip_hash,
      s.created_at AS session_created_at, s.last_seen_at, s.expires_at, s.reauthenticated_at,
      u.id, u.username, u.password_hash, u.vault_envelope, u.created_at, u.updated_at, u.password_changed_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [sha256(token), now.toISOString()],
  );
  if (!row) {
    if (required) throw new ApiError(401, "SESSION_EXPIRED", "会话已过期，请重新登录");
    return null;
  }

  const lastSeen = new Date(row.last_seen_at);
  if (now.getTime() - lastSeen.getTime() > 5 * 60_000) {
    await db.run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", [now.toISOString(), row.session_id]);
  }

  return {
    id: row.session_id,
    user: {
      id: row.id,
      username: row.username,
      password_hash: row.password_hash,
      vault_envelope: row.vault_envelope,
      created_at: row.created_at,
      updated_at: row.updated_at,
      password_changed_at: row.password_changed_at,
    },
    createdAt: row.session_created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    reauthenticatedAt: row.reauthenticated_at,
  };
}

export async function requireSession(request: NextRequest): Promise<AuthSession> {
  return (await getSession(request, true))!;
}

export async function requireRecentReauthentication(request: NextRequest, maxAgeMinutes = 5): Promise<AuthSession> {
  const session = await requireSession(request);
  const time = session.reauthenticatedAt ? new Date(session.reauthenticatedAt).getTime() : 0;
  if (Date.now() - time > maxAgeMinutes * 60_000) {
    throw new ApiError(403, "REAUTH_REQUIRED", "此操作需要重新确认主密码");
  }
  return session;
}

export async function findOwner(executor?: DbExecutor): Promise<UserRow | undefined> {
  const db = executor || (await getDatabase());
  return db.get<UserRow>("SELECT * FROM users WHERE id = ?", [OWNER_ID]);
}
