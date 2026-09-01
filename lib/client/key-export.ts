"use client";

import { toOtpAuthUri } from "@/lib/client/otp";
import type { VaultItem } from "@/lib/shared/types";

export interface PlaintextKeyExport {
  format: "visual-2fa-plaintext-keys";
  version: 1;
  exportedAt: string;
  warning: string;
  entries: Array<{
    issuer: string;
    accountName: string;
    type: VaultItem["type"];
    secret: string;
    algorithm: VaultItem["algorithm"];
    digits: number;
    period?: number;
    counter?: number;
    group: string;
    tags: string[];
    otpauthUri: string;
  }>;
}

export function serializePlaintextKeys(items: VaultItem[], exportedAt = new Date().toISOString()): string {
  const payload: PlaintextKeyExport = {
    format: "visual-2fa-plaintext-keys",
    version: 1,
    exportedAt,
    warning: "UNENCRYPTED OTP SECRETS — anyone with this file can generate your verification codes.",
    entries: items.map((item) => ({
      issuer: item.issuer,
      accountName: item.accountName,
      type: item.type,
      secret: item.secret,
      algorithm: item.algorithm,
      digits: item.digits,
      ...(item.type === "totp" ? { period: item.period } : { counter: item.counter }),
      group: item.group,
      tags: item.tags,
      otpauthUri: toOtpAuthUri(item),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadPlaintextKeys(items: VaultItem[]): void {
  const content = serializePlaintextKeys(items);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `visual-2fa-plaintext-keys-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
