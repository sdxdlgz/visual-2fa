"use client";

import { z } from "zod";
import { decryptVaultItem, encryptVaultItem, rewrapVaultKey, unlockVault } from "@/lib/client/crypto";
import { otpFingerprint } from "@/lib/client/otp";
import { vaultEnvelopeSchema } from "@/lib/shared/schemas";
import type { EncryptedItemRecord, VaultBackup, VaultItem } from "@/lib/shared/types";

const backupSchema = z.object({
  format: z.literal("visual-2fa-backup"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  envelope: vaultEnvelopeSchema,
  items: z.array(z.object({
    id: z.string().uuid(),
    version: z.literal(1),
    ciphertext: z.string().min(16).max(100_000),
    iv: z.string().min(16).max(128),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    deletedAt: z.string().datetime().nullable(),
    lastUsedAt: z.string().datetime().nullable(),
    sortOrder: z.number().finite(),
  })).max(10_000),
});

export async function createBackup(records: EncryptedItemRecord[], vaultKey: CryptoKey, backupPassword: string): Promise<string> {
  const envelope = await rewrapVaultKey(vaultKey, backupPassword);
  const backup: VaultBackup = {
    format: "visual-2fa-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    envelope,
    items: records,
  };
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(value: string): VaultBackup {
  try {
    return backupSchema.parse(JSON.parse(value)) as VaultBackup;
  } catch {
    throw new Error("备份文件格式无效或已损坏");
  }
}

export async function restoreBackup(
  backup: VaultBackup,
  backupPassword: string,
  currentKey: CryptoKey,
  currentItems: VaultItem[],
  strategy: "skip" | "replace",
): Promise<{ records: EncryptedItemRecord[]; skipped: number }> {
  const backupKey = await unlockVault(backupPassword, backup.envelope);
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const currentFingerprints = new Set(currentItems.map(otpFingerprint));
  const records: EncryptedItemRecord[] = [];
  let skipped = 0;

  for (const encrypted of backup.items) {
    const item = await decryptVaultItem(backupKey, encrypted);
    const duplicateSecret = currentFingerprints.has(otpFingerprint(item));
    const duplicateId = currentById.has(item.id);
    if (strategy === "skip" && (duplicateSecret || duplicateId)) {
      skipped += 1;
      continue;
    }
    if (strategy === "replace" && duplicateSecret && !duplicateId) {
      skipped += 1;
      continue;
    }
    const restored = { ...item, updatedAt: new Date().toISOString() };
    records.push(
      await encryptVaultItem(currentKey, restored, {
        deletedAt: encrypted.deletedAt,
        lastUsedAt: encrypted.lastUsedAt,
        sortOrder: encrypted.sortOrder,
      }),
    );
  }
  return { records, skipped };
}

export function downloadBackup(content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `visual-2fa-backup-${new Date().toISOString().slice(0, 10)}.v2fa`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
