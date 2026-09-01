import { NextRequest } from "next/server";
import { hashPassword, requireSession, verifyPassword } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { ApiError, assertSameOrigin, handleApiError, json } from "@/lib/server/http";
import { changePasswordSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = changePasswordSchema.parse(await request.json());
    if (!(await verifyPassword(input.currentPassword, session.user.password_hash))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "当前主密码不正确");
    }

    const newHash = await hashPassword(input.newPassword);
    const now = new Date().toISOString();
    const db = await getDatabase();
    await db.transaction(async (tx) => {
      await tx.run(
        "UPDATE users SET password_hash = ?, vault_envelope = ?, password_changed_at = ?, updated_at = ? WHERE id = ?",
        [newHash, JSON.stringify(input.envelope), now, now, session.user.id],
      );
      await tx.run("UPDATE sessions SET reauthenticated_at = ? WHERE id = ?", [now, session.id]);
      if (input.revokeOtherSessions) {
        await tx.run("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [session.user.id, session.id]);
      }
    });
    return json({ ok: true, passwordChangedAt: now });
  } catch (error) {
    return handleApiError(error);
  }
}
