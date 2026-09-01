export type OtpType = "totp" | "hotp";
export type OtpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export interface VaultEnvelope {
  version: 1;
  kdf: {
    name: "PBKDF2-SHA256";
    iterations: number;
    salt: string;
  };
  wrap: {
    algorithm: "AES-256-GCM";
    iv: string;
    ciphertext: string;
  };
}

export interface VaultItem {
  id: string;
  type: OtpType;
  issuer: string;
  accountName: string;
  secret: string;
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
  counter: number;
  notes: string;
  group: string;
  tags: string[];
  favorite: boolean;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface EncryptedItemRecord {
  id: string;
  version: 1;
  ciphertext: string;
  iv: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lastUsedAt: string | null;
  sortOrder: number;
}

export interface VaultPreferences {
  autoLockMinutes: number;
  backgroundLockMinutes: number;
  clipboardClearSeconds: number;
  viewMode: "compact" | "comfortable";
  sortMode: "favorite" | "name" | "recent" | "created";
}

export interface SessionSummary {
  id: string;
  current: boolean;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface VaultBackup {
  format: "visual-2fa-backup";
  version: 1;
  exportedAt: string;
  envelope: VaultEnvelope;
  items: EncryptedItemRecord[];
}
