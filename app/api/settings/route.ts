import { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { assertSameOrigin, handleApiError, json } from "@/lib/server/http";
import { serializePreferences, type SettingsRow } from "@/lib/server/serializers";
import { preferencesSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const db = await getDatabase();
    const row = await db.get<SettingsRow>("SELECT * FROM user_settings WHERE user_id = ?", [session.user.id]);
    return json({ preferences: serializePreferences(row) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = preferencesSchema.parse(await request.json());
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO user_settings
        (user_id, auto_lock_minutes, background_lock_minutes, clipboard_clear_seconds, view_mode, sort_mode, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
        auto_lock_minutes = excluded.auto_lock_minutes,
        background_lock_minutes = excluded.background_lock_minutes,
        clipboard_clear_seconds = excluded.clipboard_clear_seconds,
        view_mode = excluded.view_mode,
        sort_mode = excluded.sort_mode,
        updated_at = excluded.updated_at`,
      [
        session.user.id,
        input.autoLockMinutes,
        input.backgroundLockMinutes,
        input.clipboardClearSeconds,
        input.viewMode,
        input.sortMode,
        now,
      ],
    );
    return json({ preferences: input });
  } catch (error) {
    return handleApiError(error);
  }
}
