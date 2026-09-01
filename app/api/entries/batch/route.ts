import { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { getDatabase, isUniqueViolation } from "@/lib/server/database";
import { assertSameOrigin, handleApiError, json } from "@/lib/server/http";
import { batchItemsSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = batchItemsSchema.parse(await request.json());
    const db = await getDatabase();
    let imported = 0;
    let skipped = 0;

    await db.transaction(async (tx) => {
      for (const item of input.items) {
        const now = new Date().toISOString();
        const createdAt = item.createdAt || now;
        if (input.strategy === "replace") {
          await tx.run(
            `INSERT INTO vault_items
              (id, user_id, item_version, ciphertext, iv, sort_order, created_at, updated_at, deleted_at, last_used_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
             ON CONFLICT(id) DO UPDATE SET
              item_version = excluded.item_version,
              ciphertext = excluded.ciphertext,
              iv = excluded.iv,
              sort_order = excluded.sort_order,
              updated_at = excluded.updated_at,
              deleted_at = excluded.deleted_at`,
            [item.id, session.user.id, item.version, item.ciphertext, item.iv, item.sortOrder, createdAt, now, item.deletedAt || null],
          );
          imported += 1;
        } else {
          try {
            await tx.run(
              `INSERT INTO vault_items
                (id, user_id, item_version, ciphertext, iv, sort_order, created_at, updated_at, deleted_at, last_used_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
              [item.id, session.user.id, item.version, item.ciphertext, item.iv, item.sortOrder, createdAt, now, item.deletedAt || null],
            );
            imported += 1;
          } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            skipped += 1;
          }
        }
      }
    });

    return json({ ok: true, imported, skipped });
  } catch (error) {
    return handleApiError(error);
  }
}
