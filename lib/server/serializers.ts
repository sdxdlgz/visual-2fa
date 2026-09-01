import type { EncryptedItemRecord, VaultPreferences } from "@/lib/shared/types";

export interface VaultItemRow {
  id: string;
  user_id: string;
  item_version: number;
  ciphertext: string;
  iv: string;
  sort_order: number | string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_used_at: string | null;
}

export function serializeItem(row: VaultItemRow): EncryptedItemRecord {
  return {
    id: row.id,
    version: 1,
    ciphertext: row.ciphertext,
    iv: row.iv,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    lastUsedAt: row.last_used_at,
  };
}

export interface SettingsRow {
  auto_lock_minutes: number | string;
  background_lock_minutes: number | string;
  clipboard_clear_seconds: number | string;
  view_mode: string;
  sort_mode: string;
}

export const defaultPreferences: VaultPreferences = {
  autoLockMinutes: 10,
  backgroundLockMinutes: 5,
  clipboardClearSeconds: 30,
  viewMode: "compact",
  sortMode: "favorite",
};

export function serializePreferences(row?: SettingsRow): VaultPreferences {
  if (!row) return defaultPreferences;
  return {
    autoLockMinutes: Number(row.auto_lock_minutes),
    backgroundLockMinutes: Number(row.background_lock_minutes),
    clipboardClearSeconds: Number(row.clipboard_clear_seconds),
    viewMode: row.view_mode === "comfortable" ? "comfortable" : "compact",
    sortMode: ["favorite", "name", "recent", "created"].includes(row.sort_mode)
      ? (row.sort_mode as VaultPreferences["sortMode"])
      : "favorite",
  };
}
