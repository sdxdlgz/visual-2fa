import { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { getDatabase, isUniqueViolation } from "@/lib/server/database";
import { ApiError, assertSameOrigin, handleApiError, json } from "@/lib/server/http";
import { serializeItem, type VaultItemRow } from "@/lib/server/serializers";
import { encryptedItemInputSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const db = await getDatabase();
    const rows = await db.all<VaultItemRow>(
      "SELECT * FROM vault_items WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC",
      [session.user.id],
    );
    return json({ items: rows.map(serializeItem) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = encryptedItemInputSchema.parse(await request.json());
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO vault_items
        (id, user_id, item_version, ciphertext, iv, sort_order, created_at, updated_at, deleted_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [input.id, session.user.id, input.version, input.ciphertext, input.iv, input.sortOrder, now, now],
    );
    const row = await db.get<VaultItemRow>("SELECT * FROM vault_items WHERE id = ? AND user_id = ?", [input.id, session.user.id]);
    if (!row) throw new ApiError(500, "CREATE_FAILED", "无法保存验证器");
    return json({ item: serializeItem(row) }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return json({ error: { code: "ITEM_EXISTS", message: "该验证器已存在" } }, { status: 409 });
    }
    return handleApiError(error);
  }
}
