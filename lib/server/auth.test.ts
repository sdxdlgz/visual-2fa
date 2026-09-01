import { describe, expect, it } from "vitest";
import { hashPassword, normalizeUsername, sha256, verifyPassword } from "@/lib/server/auth";

describe("server authentication primitives", () => {
  it("hashes and verifies passwords with unique salts", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");
    expect(first).not.toBe(second);
    await expect(verifyPassword("correct horse battery staple", first)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", first)).resolves.toBe(false);
  }, 20_000);

  it("normalizes usernames without touching passwords", () => {
    expect(normalizeUsername("  Vault.Owner  ")).toBe("vault.owner");
  });

  it("produces deterministic token fingerprints", () => {
    expect(sha256("token")).toHaveLength(64);
    expect(sha256("token")).toBe(sha256("token"));
  });
});
