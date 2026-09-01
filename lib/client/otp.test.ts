import { describe, expect, it } from "vitest";
import { generateOtp, isValidBase32, normalizeSecret, parseOtpAuthUri, toOtpAuthUri } from "@/lib/client/otp";
import type { VaultItem } from "@/lib/shared/types";

const base: VaultItem = {
  id: "f4b9075d-2aca-4e75-b8ef-ecb2c40f4338",
  type: "totp",
  issuer: "Example Inc",
  accountName: "alice@example.com",
  secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  algorithm: "SHA1",
  digits: 8,
  period: 30,
  counter: 0,
  notes: "",
  group: "",
  tags: [],
  favorite: false,
  color: "#2E8B82",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("OTP utilities", () => {
  it("matches RFC 6238 TOTP vector", () => {
    expect(generateOtp(base, 59_000)).toBe("94287082");
  });

  it("matches RFC 4226 HOTP vector", () => {
    expect(generateOtp({ ...base, type: "hotp", digits: 6, counter: 0 })).toBe("755224");
  });

  it("parses and serializes otpauth URIs", () => {
    const parsed = parseOtpAuthUri(toOtpAuthUri(base));
    expect(parsed).toMatchObject({ issuer: "Example Inc", accountName: "alice@example.com", type: "totp", digits: 8 });
    expect(parsed.secret).toBe(base.secret);
  });

  it("normalizes and validates Base32", () => {
    expect(normalizeSecret("jbsw y3dp-ehpk3pxp")).toBe("JBSWY3DPEHPK3PXP");
    expect(isValidBase32("JBSWY3DPEHPK3PXP")).toBe(true);
    expect(isValidBase32("not-a-secret")).toBe(false);
  });
});
