import { NextRequest } from "next/server";
import { requireRecentReauthentication, requireSession } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { assertSameOrigin, handleApiError, json } from "@/lib/server/http";
import type { SessionSummary } from "@/lib/shared/types";

interface SessionRow {
  id: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const db = await getDatabase();
    const rows = await db.all<SessionRow>(
      "SELECT id, user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC",
      [session.user.id, new Date().toISOString()],
    );
    const sessions: SessionSummary[] = rows.map((row) => ({
      id: row.id,
      current: row.id === session.id,
      userAgent: row.user_agent || "Unknown browser",
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
    }));
    return json({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireRecentReauthentication(request);
    const db = await getDatabase();
    const result = await db.run("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [session.user.id, session.id]);
    return json({ ok: true, revoked: result.changes });
  } catch (error) {
    return handleApiError(error);
  }
}
