import { describe, expect, it } from "vitest";
import { serializePlaintextKeys } from "@/lib/client/key-export";
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
  notes: "not exported",
  group: "Work",
  tags: ["important"],
  favorite: true,
  color: "#78D5C7",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("plaintext key export", () => {
  it("exports portable secret and otpauth URI without unrelated notes", () => {
    const parsed = JSON.parse(serializePlaintextKeys([item], "2026-01-02T00:00:00.000Z"));
    expect(parsed.format).toBe("visual-2fa-plaintext-keys");
    expect(parsed.entries[0]).toMatchObject({
      issuer: "Example",
      accountName: "alice@example.com",
      secret: item.secret,
      type: "totp",
      period: 30,
      group: "Work",
    });
    expect(parsed.entries[0].otpauthUri).toContain("otpauth://totp/");
    expect(JSON.stringify(parsed)).not.toContain(item.notes);
  });
});
