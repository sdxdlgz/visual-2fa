import { getDatabase } from "@/lib/server/database";
import { handleApiError, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDatabase();
    await db.get("SELECT 1 AS ok");
    return json({ status: "ok", database: db.dialect });
  } catch (error) {
    return handleApiError(error);
  }
}
