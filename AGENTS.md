# AGENTS.md

This file is the coding-agent guide for Visual 2FA. Read it before changing authentication, cryptography, vault records, imports/exports, database code, CSP, or deployment files.

## 1. Mission

Visual 2FA is a single-owner, self-hosted web authenticator vault.

The product must remain:

- safe for real OTP seeds;
- usable on desktop and mobile;
- portable between SQLite and PostgreSQL;
- free of analytics, ads, remote scripts, and remote fonts;
- honest about its security boundary.

The browser encrypts authenticator data. The server authenticates the owner, stores sessions, and persists ciphertext.

## 2. Non-negotiable rules

### Secrets

Except for the defined HTTPS authentication flow and intentional in-app display or user-authorized client-side export, never log, print, commit, expose in errors, send to telemetry, or transmit:

- OTP secrets or QR payloads;
- generated OTP codes;
- master or backup passwords;
- raw vault keys or wrapping keys;
- session cookies or raw session tokens;
- decrypted notes;
- plaintext key exports or backup contents.

Tests must use clearly fake fixtures only.

### Encryption boundary

The following fields belong inside the encrypted `VaultItem` payload:

- OTP secret;
- issuer and account name;
- notes;
- group and tags;
- favorite flag and display color;
- OTP algorithm, digits, period, type, and counter.

Do not move these fields into plaintext database columns for convenience.

The plaintext-column allowlist for `vault_items` is: `id`, `user_id`, `item_version`, `ciphertext`, `iv`, `sort_order`, `created_at`, `updated_at`, `deleted_at`, and `last_used_at`. Adding any other plaintext item column requires an explicit security review.

These columns still reveal metadata such as record count, ciphertext size, timestamps, deletion state, and ordering. Do not claim that the database leaks no metadata.
### Sensitive actions

These actions require recent master-password reauthentication:

- revealing a Base32 secret;
- displaying a migration QR;
- exporting plaintext keys;
- permanently deleting records;
- clearing the trash;
- revoking other sessions.

Plaintext key exports must be generated in the browser and must never pass through the server.

`requireRecentReauthentication` currently accepts a password confirmation recorded on the current database session within the last 5 minutes. Changing that window is a security-policy change and needs tests and documentation.

### Web security

- Keep mutation APIs protected by `assertSameOrigin`.
- Keep sessions in HttpOnly, SameSite=Strict cookies.
- On HTTPS, cookies must also be `Secure`; keep `Path=/`, explicit expiry, and a fresh 32-byte opaque token per login. Only a SHA-256 token fingerprint may be stored.
- Keep the per-request CSP nonce in `middleware.ts`.
- Keep `app/layout.tsx` dynamically rendered; static rendering breaks Next.js script nonces.
- Do not add `dangerouslySetInnerHTML` for user-controlled content.
- Do not add third-party analytics, tag managers, remote scripts, remote fonts, or remote logo services.
- Treat XSS as full vault compromise.

### Cryptographic invariants

- Vault and item encryption use AES-256-GCM with a fresh cryptographically random 12-byte IV and a 128-bit tag for every operation. Never reuse an IV with the same key.
- Vault-key wrapping uses AAD `visual-2fa:vault-key:v1`; item encryption uses AAD `visual-2fa:item:<item-id>:v1`. Authentication failure must produce a generic integrity/unlock error, not partial plaintext.
- PBKDF2 uses SHA-256, a random 16-byte salt, 600,000 iterations, and a 256-bit wrapping key.
- Server password hashes use scrypt with a random 16-byte salt, `N=32768`, `r=8`, `p=1`, a 64-byte output, and a 64 MiB max-memory guard.
- KDF parameters are encoded with the stored envelope/hash. Do not silently change defaults without preserving old-data verification.
- Bump the encrypted payload or backup version when a format change cannot be safely defaulted by old readers. Add old-version decrypt/restore fixtures before shipping a version change.

## 3. Security model

```text
Browser                                      Server                         Database
-------                                      ------                         --------
master password ───── HTTPS ───────────────> scrypt verification
       │                                          │
       └─ PBKDF2-SHA-256 (600,000)                └─ hashed password
                    │
                    v
             AES-GCM wrapping key
                    │
                    v
           unwrap random 256-bit vault key
                    │
      ┌─────────────┴─────────────┐
      v                           v
encrypt/decrypt VaultItem       generate TOTP/HOTP
      │
      └──────── ciphertext + IV ────────────────> API ────────────────────> vault_items
```

Important limitations:

- The login password reaches the server over HTTPS for authentication.
- A malicious server can replace the delivered JavaScript.
- A compromised browser, device, or extension can read an unlocked vault.
- This is client-side encryption against a database-only compromise, not strict zero knowledge.

Keep user-facing claims consistent with this model. See `SECURITY.md`.

## 4. Architecture map

### App and routes

```text
app/
├─ layout.tsx                     metadata, fonts, Toaster, force-dynamic
├─ page.tsx                       mounts the client app
├─ globals.css                    complete responsive design system
├─ manifest.ts                    PWA manifest
└─ api/
   ├─ auth/
   │  ├─ state                    setup/auth/session state
   │  ├─ setup                    first owner only
   │  ├─ login / logout / reauth
   │  ├─ password                 password change + key rewrap envelope
   │  └─ sessions                 list/revoke sessions
   ├─ entries/
   │  ├─ route                    encrypted list/create
   │  ├─ [id]                     encrypted update, soft/permanent delete
   │  ├─ batch                    encrypted batch insert/replace
   │  └─ reorder                  sort-order transaction
   ├─ settings                    persisted UI/security preferences
   └─ health                      database health
```

Every API route that uses SQLite/native crypto must remain on the Node runtime.

### Client domain code

| File | Responsibility |
|---|---|
| `lib/client/crypto.ts` | Vault-key creation, PBKDF2 wrapping, AES-GCM item encryption/decryption |
| `lib/client/otp.ts` | Base32 validation, `otpauth` parsing/serialization, TOTP/HOTP generation |
| `lib/client/google-migration.ts` | Bounded protobuf decoder for Google Authenticator migration QR data |
| `lib/client/backup.ts` | Encrypted `.v2fa` backup creation and restore |
| `lib/client/key-export.ts` | Explicit plaintext JSON export for selected keys |
| `lib/client/api.ts` | Same-origin JSON client and typed API errors |

### Server domain code

| File | Responsibility |
|---|---|
| `lib/server/auth.ts` | scrypt hashes, session tokens, rate limiting, reauthentication |
| `lib/server/database.ts` | SQLite/PostgreSQL adapters, parameter conversion, transactions, schema creation |
| `lib/server/http.ts` | same-origin checks, no-store JSON, safe API errors |
| `lib/server/serializers.ts` | database-row to API-model conversion |

### Shared contracts

- `lib/shared/types.ts`: encrypted record, decrypted vault item, preferences, backup types.
- `lib/shared/schemas.ts`: all server-facing Zod limits and validation.

Change shared contracts deliberately. Backup and encrypted payload versions are compatibility boundaries.

### UI composition

| Component | Responsibility |
|---|---|
| `visual-two-factor-app.tsx` | setup/login/lock/unlock lifecycle and auto-lock |
| `vault-dashboard.tsx` | decrypted state, CRUD, batch actions, reorder, key export orchestration |
| `entry-dialog.tsx` | QR/image/camera/URI/manual/Google migration import |
| `otp-row.tsx` | current code, copy, selection, drag handle, HOTP controls |
| `entry-detail.tsx` | details, secret reveal, migration QR |
| `settings-panel.tsx` | preferences, backup/restore, password, sessions |
| `bulk-edit-dialog.tsx` | group/tag batch operations |
| `group-manager-dialog.tsx` | group rename/merge |
| `reauth-dialog.tsx` | recent-password confirmation for sensitive actions |

## 5. Persistence model

`lib/server/database.ts` creates these tables:

| Table | Purpose |
|---|---|
| `users` | single owner, scrypt password hash, wrapped vault-key envelope |
| `sessions` | hashed opaque session tokens, expiry, recent reauth time |
| `vault_items` | encrypted item payloads plus minimal record metadata |
| `login_attempts` | bounded login rate limiting |
| `user_settings` | non-secret UI and auto-lock preferences |

Database rules:

- `DATABASE_URL=file:...` selects SQLite.
- `postgres://` and `postgresql://` select PostgreSQL.
- SQL uses `?` placeholders; the PostgreSQL adapter converts them to `$1`, `$2`, etc.
- The current converter replaces every `?` character. SQL passed through it must not contain literal `?` characters in quoted strings, comments, JSON/path operators, or vendor-specific operators. Parameterize all values; redesign the adapter before relaxing this rule.
- Prefer portable conventions already used here: ISO-8601 text timestamps, integer flags instead of dialect booleans, application-generated IDs, and no reliance on `RETURNING` or auto-increment semantics.
- Any new generic SQL or migration must be exercised in SQLite and PostgreSQL. If a PostgreSQL test service is unavailable, record that limitation and do not claim dual-dialect verification.
- New SQL must work in both SQLite and PostgreSQL.
- Use transactions for multi-row reorder, batch operations, and setup invariants.
- Scope every item/session mutation by `user_id`, even though the current product is single-owner.
- Do not use SQLite-only JSON functions or PostgreSQL-only syntax without a dialect branch.

## 6. Critical flows

### Setup and unlock

1. The browser generates a random vault key.
2. The browser derives a wrapping key from the master password.
3. The browser wraps the vault key and sends the envelope plus login credentials to setup.
4. The server stores the envelope and a separate scrypt password hash.
5. On login/reauth, the server verifies the password; the browser unwraps the vault key.
6. The unwrapped key lives only in client memory and is released on lock/logout.

Do not store the unwrapped vault key in localStorage, IndexedDB, cookies, server sessions, or logs.

### Encrypted CRUD

1. Validate and normalize the decrypted `VaultItem` in the browser.
2. Encrypt with AES-GCM and item-ID AAD.
3. Send only the encrypted record to `/api/entries`.
4. Decrypt API records only after the vault is unlocked.

When adding a new encrypted field, update `VaultItem` and its schema. A database migration is normally unnecessary because the complete item is one ciphertext blob.

### QR and migration import

- Decode QR images locally with ZXing.
- Parse standard `otpauth://` data with `lib/client/otp.ts`.
- Parse Google migration protobuf with the bounded custom reader.
- Current hard limits: encoded `data` ≤ 1,400,000 characters; protobuf varint ≤ 10 bytes; secret 10–128 bytes; batch size 1–100; `0 <= batchIndex < batchSize`; migration version 0–10.
- For Google migration entries, only SHA-1/SHA-256/SHA-512, 6/8 digits, and TOTP/HOTP are accepted. Unknown/unsupported entries are counted and skipped; malformed Base64, invalid wire types, truncation, and invalid batch metadata reject the QR. Standard/manual Visual 2FA entries may also use 7 digits.
- Overall item count is currently bounded indirectly by payload size. If the payload cap is raised, add and test an explicit item-count limit first.
- Never include a raw QR payload in an exception, toast, or log.
- Multi-part batches are matched by batch ID and batch size and ordered by batch index. A repeated index replaces that part; an ID/size conflict starts a new collection; missing parts block import.

### Backup versus plaintext export

- `.v2fa`: encrypted recovery format; preserve its version and password wrapping behavior.
- Plaintext key JSON: unencrypted migration format; require reauth and an explicit warning.
- Do not casually merge these flows or make plaintext export the default.

## 7. Common change recipes

### Add a mutation API

1. Define a bounded Zod schema.
2. Call `assertSameOrigin(request)` before state changes.
3. Call `requireSession` or `requireRecentReauthentication` as appropriate.
4. Scope SQL by owner ID.
5. Return no-store JSON through `json()`.
6. Ensure errors do not echo secrets.
7. Test both success and rejection behavior.

`assertSameOrigin` rejects cross-site `Sec-Fetch-Site`, requires an `Origin`, then compares it with `APP_ORIGIN` or the effective `Host`/`X-Forwarded-Host`. Do not weaken missing-Origin behavior for browser mutations.

Zod field limits are not a raw-body limit. New endpoints that can receive large JSON/files must reject unexpected `Content-Type` and cap bytes/items before expensive parsing, decryption, or database work. Consider retries and concurrent updates explicitly; use a transaction whenever partial success would corrupt state.

### Add a field to encrypted entries

1. Update `VaultItem` in `lib/shared/types.ts`.
2. Update `vaultItemSchema`.
3. Update create/edit/import/export UI intentionally.
4. Decide how old ciphertext without the field will be migrated or defaulted.
5. Add crypto round-trip tests.
6. Add old-payload/defaulting and encrypted-backup restore tests when compatibility can change.
7. Explicitly decide whether the field belongs in standard import, Google migration import, encrypted backup, and plaintext export.

### Add an import format

1. Keep parsing in `lib/client/`.
2. Bound input bytes, nesting, item count, and string lengths.
3. Normalize to `ParsedOtpAuth`/`VaultItem`.
4. Detect duplicates by normalized type + secret.
5. Show a preview before persistence.
6. Add fake fixture tests and a real browser image/scan smoke test.

### Add a sensitive export/reveal

1. Route the action through `ReauthDialog`.
2. Generate output locally.
3. Add prominent unencrypted-data copy if applicable.
4. Do not send output to an API.
5. Hide/revoke temporary UI and object URLs promptly.

## 8. Commands and quality gate

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run check
npm audit --omit=dev
docker-compose -f docker-compose.yml config --quiet
docker-compose -f docker-compose.yml -f docker-compose.build.yml config --quiet
```

`npm run check` runs lint, typecheck, all Vitest tests, and the production build. Docker Compose validation and production/browser smoke checks are separate.

Before committing a functional change:

1. `npm run check` passes;
2. `npm audit --omit=dev` reports zero known production vulnerabilities;
3. `git diff --check` passes;
4. no real secret, password, cookie, backup, QR payload, or downloaded key file is staged;
5. changed security flows have focused success and rejection tests;
6. changed UI has desktop and 390px mobile browser verification;
7. production CSP script nonces still match the response nonce;
8. both pull-only and local-build Compose configurations validate when deployment files changed.

If audit or a required registry is unreachable, record the external failure and report that check as unverified; never convert a network failure into a pass.

After an explicitly authorized push, compare `git rev-parse HEAD` with `git ls-remote origin refs/heads/main` and require identical hashes.

## 9. Test strategy

Existing tests cover:

- RFC 4226 HOTP and RFC 6238 TOTP vectors;
- Base32 and `otpauth` parsing;
- Google Authenticator migration protobuf;
- plaintext key-export shape;
- PBKDF2/AES-GCM vault and item round trips;
- scrypt password primitives.

For UI smoke tests, use fake OTP seeds and an isolated browser profile. Verify:

- setup → unlock;
- standard and migration QR import;
- generated code length and countdown;
- batch group/tag operations;
- group merge/rename;
- plaintext export reauth and file shape;
- drag-order persistence;
- no horizontal overflow at 390px and desktop widths.

### Repeatable production smoke

1. Run `npm run build`.
2. For local standalone testing, copy `public/` and `.next/static/` into `.next/standalone/`, launch `server.js` on an isolated port with a disposable SQLite path, and verify `/api/health`.
3. Fetch the page headers and HTML. Extract the CSP `nonce-...` value and require every Next `<script nonce="...">` to use the same value.
4. Launch Edge/Chrome with an isolated project-drive profile. Use fake accounts/seeds to test setup, import, copy, reauth, batch actions, backup/export, and reorder at 390px and desktop widths.
5. Save only non-sensitive evidence, then remove the disposable database, browser profile, downloads, screenshots, and smoke scripts before staging.

## 10. Deployment invariants

### Docker / SQLite

- `Dockerfile` runs as a non-root user and keeps the container-internal port at `3000`.
- `docker-compose.yml` pulls `ghcr.io/sdxdlgz/visual-2fa:${VISUAL_2FA_TAG:-latest}` and maps host port `${VISUAL_2FA_PORT:-28473}` to container port `3000`.
- `docker-compose.build.yml` is the explicit local-source build override; do not re-add `build:` to the pull-only base file.
- `/app/data` is the persistent volume. Do not bake a database or `.env` into the image.
- `.github/workflows/publish-container.yml` must run checks before publishing AMD64/ARM64 images. Main publishes `latest` and `sha-*`; `v*.*.*` tags publish release tags.
- Keep GHCR images linked to this repository through OCI source labels. Changing registry names or tag policy requires README/Compose/workflow updates together.
- Use HTTPS through a reverse proxy in production. Caddy on the host proxies to `127.0.0.1:28473`, not directly to the container-only port.

### Vercel / PostgreSQL

- Never use SQLite for Vercel persistence.
- Use a pooled PostgreSQL URL.
- The database account needs schema-creation rights on first run.
- Update `APP_ORIGIN` when the public domain changes.

## 11. Repository hygiene

Do not commit:

- `.env*` except `.env.example`;
- `data/`, SQLite files, WAL/SHM files;
- `.v2fa` backups or plaintext key exports;
- screenshots containing real accounts/codes;
- browser profiles, downloads, coverage, `.next`, or temporary smoke scripts;
- `task_plan.md`, `findings.md`, or `progress.md`.

Keep documentation synchronized with behavior. User-facing instructions belong in `README.md`; security claims and reporting rules belong in `SECURITY.md`; agent implementation rules belong here.

### Maintainer harness note

In the maintainer's mixed Windows/WSL environment, `npm` runs Windows Node while bare `node` may resolve to Linux Node. Native packages such as `better-sqlite3` must be exercised through `npm run ...` or the same Node runtime used by npm. Keep caches, browser profiles, screenshots, downloads, and temporary files on the project drive; do not write them to `C:` or the OS temp directory.

## 12. Definition of done

A change is done only when it is:

- secure within the documented threat model;
- compatible with both database modes or explicitly scoped;
- validated by focused tests;
- usable on desktop and mobile;
- documented where users and future agents will find it;
- cleanly committed, with no sensitive artifacts;
- pushed only when the user has authorized the external write.
