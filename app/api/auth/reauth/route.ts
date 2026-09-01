import { NextRequest } from "next/server";
import {
  assertLoginAllowed,
  clearLoginAttempts,
  loginAttemptKey,
  recordFailedLogin,
  requireSession,
  verifyPassword,
} from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { ApiError, assertSameOrigin, handleApiError, json } from "@/lib/server/http";
import { vaultEnvelopeSchema } from "@/lib/shared/schemas";
import { z } from "zod";

const inputSchema = z.object({ password: z.string().min(1).max(128) });

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = inputSchema.parse(await request.json());
    const attemptKey = loginAttemptKey(request, session.user.username);
    await assertLoginAllowed(attemptKey);

    if (!(await verifyPassword(input.password, session.user.password_hash))) {
      await recordFailedLogin(attemptKey);
      throw new ApiError(401, "INVALID_CREDENTIALS", "主密码不正确");
    }

    await clearLoginAttempts(attemptKey);
    const now = new Date().toISOString();
    const db = await getDatabase();
    await db.run("UPDATE sessions SET reauthenticated_at = ?, last_seen_at = ? WHERE id = ?", [now, now, session.id]);
    return json({ envelope: vaultEnvelopeSchema.parse(JSON.parse(session.user.vault_envelope)), reauthenticatedAt: now });
  } catch (error) {
    return handleApiError(error);
  }
}
