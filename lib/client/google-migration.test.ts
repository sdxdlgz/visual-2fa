import { describe, expect, it } from "vitest";
import { decodeGoogleMigrationUri } from "@/lib/client/google-migration";

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function varint(input: number | bigint): Uint8Array {
  let value = BigInt(input);
  const bytes: number[] = [];
  do {
    let byte = Number(value & 0x7fn);
    value >>= 7n;
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return new Uint8Array(bytes);
}

function fieldVarint(field: number, value: number | bigint): Uint8Array {
  return concat(varint((field << 3) | 0), varint(value));
}

function fieldBytes(field: number, value: Uint8Array | string): Uint8Array {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return concat(varint((field << 3) | 2), varint(bytes.length), bytes);
}

function otpParameters(config: {
  secret: string;
  name: string;
  issuer: string;
  algorithm?: number;
  digits?: number;
  type?: number;
  counter?: number;
}): Uint8Array {
  return concat(
    fieldBytes(1, new TextEncoder().encode(config.secret)),
    fieldBytes(2, config.name),
    fieldBytes(3, config.issuer),
    fieldVarint(4, config.algorithm ?? 1),
    fieldVarint(5, config.digits ?? 1),
    fieldVarint(6, config.type ?? 2),
    fieldVarint(7, config.counter ?? 0),
  );
}

function migrationUri(payload: Uint8Array): string {
  return `otpauth-migration://offline?data=${encodeURIComponent(Buffer.from(payload).toString("base64"))}`;
}

describe("Google Authenticator migration decoder", () => {
  it("decodes multiple TOTP/HOTP entries and batch metadata", () => {
    const payload = concat(
      fieldBytes(1, otpParameters({
        secret: "12345678901234567890",
        name: "Google:alice@example.com",
        issuer: "Google",
        algorithm: 1,
        digits: 1,
        type: 2,
      })),
      fieldBytes(1, otpParameters({
        secret: "abcdefghijabcdefghij",
        name: "GitHub:bob@example.com",
        issuer: "GitHub",
        algorithm: 2,
        digits: 2,
        type: 1,
        counter: 42,
      })),
      fieldVarint(2, 1),
      fieldVarint(3, 2),
      fieldVarint(4, 1),
      fieldVarint(5, BigInt.asUintN(64, -9876n)),
    );

    const decoded = decodeGoogleMigrationUri(migrationUri(payload));
    expect(decoded).toMatchObject({ version: 1, batchSize: 2, batchIndex: 1, batchId: -9876, skipped: 0 });
    expect(decoded.items).toHaveLength(2);
    expect(decoded.items[0]).toMatchObject({
      type: "totp",
      issuer: "Google",
      accountName: "alice@example.com",
      secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    expect(decoded.items[1]).toMatchObject({
      type: "hotp",
      issuer: "GitHub",
      accountName: "bob@example.com",
      algorithm: "SHA256",
      digits: 8,
      counter: 42,
    });
  });

  it("skips unsupported entries without exposing their contents", () => {
    const unsupported = otpParameters({
      secret: "12345678901234567890",
      name: "Unsupported",
      issuer: "Legacy",
      algorithm: 4,
    });
    const decoded = decodeGoogleMigrationUri(migrationUri(fieldBytes(1, unsupported)));
    expect(decoded.items).toEqual([]);
    expect(decoded.skipped).toBe(1);
  });

  it("rejects malformed and non-migration payloads", () => {
    expect(() => decodeGoogleMigrationUri("otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP")).toThrow("不是 Google Authenticator");
    expect(() => decodeGoogleMigrationUri("otpauth-migration://offline?data=!!!")).toThrow("Base64");
  });
});
