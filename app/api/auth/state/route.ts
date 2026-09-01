import { NextRequest } from "next/server";
import { getSession, findOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { handleApiError, json } from "@/lib/server/http";
import { serializePreferences, type SettingsRow } from "@/lib/server/serializers";
import { vaultEnvelopeSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const owner = await findOwner();
    if (!owner) {
      return json({ setupRequired: true, authenticated: false });
    }

    const session = await getSession(request);
    if (!session) {
      return json({ setupRequired: false, authenticated: false });
    }

    const db = await getDatabase();
    const settings = await db.get<SettingsRow>("SELECT * FROM user_settings WHERE user_id = ?", [session.user.id]);
    return json({
      setupRequired: false,
      authenticated: true,
      user: {
        username: session.user.username,
        createdAt: session.user.created_at,
        passwordChangedAt: session.user.password_changed_at,
      },
      envelope: vaultEnvelopeSchema.parse(JSON.parse(session.user.vault_envelope)),
      preferences: serializePreferences(settings),
      session: {
        id: session.id,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
