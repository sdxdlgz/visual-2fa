import { describe, expect, it } from "vitest";
import { createVault, decryptVaultItem, encryptVaultItem, rewrapVaultKey, unlockVault, VaultCryptoError } from "@/lib/client/crypto";
import type { VaultItem } from "@/lib/shared/types";

const item: VaultItem = {
  id: "f4b9075d-2aca-4e75-b8ef-ecb2c40f4338",
  type: "totp",
  issuer: "Example",
  accountName: "alice@example.com",
  secret: "JBSWY3DPEHPK3PXP",
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  counter: 0,
  notes: "test note",
  group: "Personal",
  tags: ["important"],
  favorite: true,
  color: "#2E8B82",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("client vault crypto", () => {
  it("wraps, unlocks, encrypts and decrypts vault items", async () => {
    const created = await createVault("correct horse battery staple");
    const unlocked = await unlockVault("correct horse battery staple", created.envelope);
    const encrypted = await encryptVaultItem(unlocked, item);
    expect(encrypted.ciphertext).not.toContain(item.secret);
    await expect(decryptVaultItem(unlocked, encrypted)).resolves.toEqual(item);
  }, 20_000);

  it("rejects an incorrect password", async () => {
    const created = await createVault("correct horse battery staple");
    await expect(unlockVault("incorrect-password", created.envelope)).rejects.toBeInstanceOf(VaultCryptoError);
  }, 20_000);

  it("rewraps the same data key with a new password", async () => {
    const created = await createVault("old password is sufficiently long");
    const encrypted = await encryptVaultItem(created.key, item);
    const nextEnvelope = await rewrapVaultKey(created.key, "new password is sufficiently long");
    const nextKey = await unlockVault("new password is sufficiently long", nextEnvelope);
    await expect(decryptVaultItem(nextKey, encrypted)).resolves.toEqual(item);
  }, 20_000);
});
