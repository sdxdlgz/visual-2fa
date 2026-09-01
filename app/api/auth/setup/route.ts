import { NextRequest } from "next/server";
import { createSession, findOwner, hashPassword, normalizeUsername, setSessionCookie } from "@/lib/server/auth";
import { getDatabase, isUniqueViolation } from "@/lib/server/database";
import { ApiError, assertSameOrigin, handleApiError, json } from "@/lib/server/http";
import { setupInputSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = setupInputSchema.parse(await request.json());
    const db = await getDatabase();
    const username = normalizeUsername(input.username);
    const passwordHash = await hashPassword(input.password);
    const now = new Date().toISOString();

    const session = await db.transaction(async (tx) => {
      if (await findOwner(tx)) {
        throw new ApiError(409, "SETUP_COMPLETE", "保险库已完成初始化");
      }
      await tx.run(
        `INSERT INTO users
          (id, username, password_hash, vault_envelope, created_at, updated_at, password_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ["owner", username, passwordHash, JSON.stringify(input.envelope), now, now, now],
      );
      await tx.run(
        `INSERT INTO user_settings
          (user_id, auto_lock_minutes, background_lock_minutes, clipboard_clear_seconds, view_mode, sort_mode, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ["owner", 10, 5, 30, "compact", "favorite", now],
      );
      return createSession(tx, request);
    });

    const response = json(
      {
        authenticated: true,
        user: { username, createdAt: now, passwordChangedAt: now },
        envelope: input.envelope,
      },
      { status: 201 },
    );
    setSessionCookie(response, session.token, session.expiresAt, request);
    return response;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return json({ error: { code: "SETUP_COMPLETE", message: "保险库已完成初始化" } }, { status: 409 });
    }
    return handleApiError(error);
  }
}
