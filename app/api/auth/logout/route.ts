import { NextRequest } from "next/server";
import { clearSessionCookie, SESSION_COOKIE, sha256 } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { assertSameOrigin, handleApiError, json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      const db = await getDatabase();
      await db.run("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
    }
    const response = json({ ok: true });
    clearSessionCookie(response, request);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
