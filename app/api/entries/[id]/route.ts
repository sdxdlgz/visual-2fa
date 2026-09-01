import { NextRequest } from "next/server";
import { requireRecentReauthentication, requireSession } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { ApiError, assertSameOrigin, handleApiError, json } from "@/lib/server/http";
import { serializeItem, type VaultItemRow } from "@/lib/server/serializers";
import { encryptedItemPatchSchema } from "@/lib/shared/schemas";
import { z } from "zod";

const idSchema = z.string().uuid();
type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const id = idSchema.parse((await context.params).id);
    const input = encryptedItemPatchSchema.parse(await request.json());
    const columns: string[] = [];
    const values: unknown[] = [];

    if (input.ciphertext !== undefined && input.iv !== undefined && input.version !== undefined) {
      columns.push("ciphertext = ?", "iv = ?", "item_version = ?");
      values.push(input.ciphertext, input.iv, input.version);
    }
    if (input.sortOrder !== undefined) {
      columns.push("sort_order = ?");
      values.push(input.sortOrder);
    }
    if (input.deletedAt !== undefined) {
      columns.push("deleted_at = ?");
      values.push(input.deletedAt);
    }
    if (input.lastUsedAt !== undefined) {
      columns.push("last_used_at = ?");
      values.push(input.lastUsedAt);
    }
    columns.push("updated_at = ?");
    values.push(new Date().toISOString(), id, session.user.id);

    const db = await getDatabase();
    const result = await db.run(`UPDATE vault_items SET ${columns.join(", ")} WHERE id = ? AND user_id = ?`, values);
    if (result.changes === 0) throw new ApiError(404, "ITEM_NOT_FOUND", "验证器不存在");
    const row = await db.get<VaultItemRow>("SELECT * FROM vault_items WHERE id = ? AND user_id = ?", [id, session.user.id]);
    return json({ item: serializeItem(row!) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await context.params).id);
    const permanent = request.nextUrl.searchParams.get("permanent") === "true";
    const session = permanent ? await requireRecentReauthentication(request) : await requireSession(request);
    const db = await getDatabase();
    const result = permanent
      ? await db.run("DELETE FROM vault_items WHERE id = ? AND user_id = ?", [id, session.user.id])
      : await db.run("UPDATE vault_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?", [
          new Date().toISOString(),
          new Date().toISOString(),
          id,
          session.user.id,
        ]);
    if (result.changes === 0) throw new ApiError(404, "ITEM_NOT_FOUND", "验证器不存在");
    return json({ ok: true, permanent });
  } catch (error) {
    return handleApiError(error);
  }
}
