import { NextRequest } from "next/server";
import {
  assertLoginAllowed,
  clearLoginAttempts,
  createSession,
  findOwner,
  hashPassword,
  loginAttemptKey,
  normalizeUsername,
  recordFailedLogin,
  setSessionCookie,
  verifyPassword,
} from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { ApiError, assertSameOrigin, handleApiError, json } from "@/lib/server/http";
import { loginInputSchema, vaultEnvelopeSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = loginInputSchema.parse(await request.json());
    const username = normalizeUsername(input.username);
    const attemptKey = loginAttemptKey(request, username);
    await assertLoginAllowed(attemptKey);

    const owner = await findOwner();
    if (!owner) {
      throw new ApiError(409, "SETUP_REQUIRED", "请先初始化保险库");
    }

    let valid = false;
    if (owner.username === username) {
      valid = await verifyPassword(input.password, owner.password_hash);
    } else {
      await hashPassword(input.password);
    }

    if (!valid) {
      await recordFailedLogin(attemptKey);
      throw new ApiError(401, "INVALID_CREDENTIALS", "用户名或主密码不正确");
    }

    const db = await getDatabase();
    await clearLoginAttempts(attemptKey);
    await db.run("DELETE FROM sessions WHERE expires_at <= ?", [new Date().toISOString()]);
    const session = await createSession(db, request, owner.id);
    const response = json({
      authenticated: true,
      user: { username: owner.username, createdAt: owner.created_at, passwordChangedAt: owner.password_changed_at },
      envelope: vaultEnvelopeSchema.parse(JSON.parse(owner.vault_envelope)),
    });
    setSessionCookie(response, session.token, session.expiresAt, request);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
