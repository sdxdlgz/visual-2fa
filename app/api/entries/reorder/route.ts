import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { assertSameOrigin, handleApiError, json } from "@/lib/server/http";

const inputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1_000).refine((ids) => new Set(ids).size === ids.length, "排序列表包含重复项目"),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = inputSchema.parse(await request.json());
    const db = await getDatabase();
    let updated = 0;
    await db.transaction(async (tx) => {
      for (let index = 0; index < input.ids.length; index += 1) {
        const result = await tx.run(
          "UPDATE vault_items SET sort_order = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
          [index, input.ids[index], session.user.id],
        );
        updated += result.changes;
      }
    });
    return json({ ok: true, updated });
  } catch (error) {
    return handleApiError(error);
  }
}
