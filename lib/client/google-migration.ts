"use client";

import * as OTPAuth from "otpauth";
import type { OtpAlgorithm } from "@/lib/shared/types";
import type { ParsedOtpAuth } from "@/lib/client/otp";

export interface GoogleMigrationPart {
  items: ParsedOtpAuth[];
  skipped: number;
  version: number;
  batchSize: number;
  batchIndex: number;
  batchId: number;
}

class ProtobufReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.bytes.length;
  }

  readVarintBigInt(): bigint {
    let result = 0n;
    let shift = 0n;
    for (let index = 0; index < 10; index += 1) {
      if (this.offset >= this.bytes.length) throw new Error("迁移数据被截断");
      const byte = this.bytes[this.offset++];
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
    }
    throw new Error("迁移数据包含无效的 varint");
  }

  readVarint(): number {
    const value = this.readVarintBigInt();
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("迁移数据中的数字超出安全范围");
    return Number(value);
  }

  readInt32(): number {
    return Number(BigInt.asIntN(32, this.readVarintBigInt()));
  }

  readTag(): { field: number; wire: number } {
    const tag = this.readVarint();
    const field = tag >>> 3;
    const wire = tag & 0x07;
    if (field === 0) throw new Error("迁移数据包含无效字段");
    return { field, wire };
  }

  readBytes(): Uint8Array {
    const length = this.readVarint();
    const end = this.offset + length;
    if (length < 0 || end > this.bytes.length) throw new Error("迁移数据长度无效");
    const value = this.bytes.slice(this.offset, end);
    this.offset = end;
    return value;
  }

  skip(wire: number): void {
    if (wire === 0) {
      this.readVarintBigInt();
      return;
    }
    if (wire === 1) {
      this.advance(8);
      return;
    }
    if (wire === 2) {
      this.advance(this.readVarint());
      return;
    }
    if (wire === 5) {
      this.advance(4);
      return;
    }
    throw new Error(`不支持的 protobuf wire type：${wire}`);
  }

  private advance(length: number): void {
    if (length < 0 || this.offset + length > this.bytes.length) throw new Error("迁移数据被截断");
    this.offset += length;
  }
}

const decoder = new TextDecoder("utf-8", { fatal: true });

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.trim().replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized || normalized.length > 1_400_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("Google Authenticator 迁移数据的 Base64 无效");
  }
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("Google Authenticator 迁移数据无法解码");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase32(bytes: Uint8Array): string {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new OTPAuth.Secret({ buffer }).base32.replace(/=+$/g, "");
}

function parseAlgorithm(value: number): OtpAlgorithm | null {
  if (value === 0 || value === 1) return "SHA1";
  if (value === 2) return "SHA256";
  if (value === 3) return "SHA512";
  return null;
}

function parseOtpParameters(bytes: Uint8Array): ParsedOtpAuth | null {
  const reader = new ProtobufReader(bytes);
  let secret: Uint8Array = new Uint8Array(0);
  let name = "";
  let issuer = "";
  let algorithmValue = 1;
  let digitsValue = 1;
  let typeValue = 2;
  let counter = 0;

  while (!reader.done) {
    const { field, wire } = reader.readTag();
    if (field === 1 && wire === 2) secret = reader.readBytes();
    else if (field === 2 && wire === 2) name = decoder.decode(reader.readBytes()).trim();
    else if (field === 3 && wire === 2) issuer = decoder.decode(reader.readBytes()).trim();
    else if (field === 4 && wire === 0) algorithmValue = reader.readVarint();
    else if (field === 5 && wire === 0) digitsValue = reader.readVarint();
    else if (field === 6 && wire === 0) typeValue = reader.readVarint();
    else if (field === 7 && wire === 0) {
      const value = reader.readVarintBigInt();
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      counter = Number(value);
    } else reader.skip(wire);
  }

  const algorithm = parseAlgorithm(algorithmValue);
  if (secret.byteLength < 10 || secret.byteLength > 128 || !algorithm) return null;
  if (![0, 1, 2].includes(digitsValue) || ![0, 1, 2].includes(typeValue)) return null;
  const type = typeValue === 1 ? "hotp" : "totp";
  const separator = name.indexOf(":");
  const labelIssuer = separator >= 0 ? name.slice(0, separator).trim() : "";
  const accountName = (separator >= 0 ? name.slice(separator + 1) : name).trim();
  const finalIssuer = (issuer || labelIssuer || "未命名服务").slice(0, 80);

  return {
    type,
    issuer: finalIssuer,
    accountName: accountName.slice(0, 120),
    secret: bytesToBase32(secret),
    algorithm,
    digits: digitsValue === 2 ? 8 : 6,
    period: 30,
    counter,
  };
}

export function decodeGoogleMigrationUri(raw: string): GoogleMigrationPart {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("这不是有效的 Google Authenticator 迁移链接");
  }
  if (url.protocol !== "otpauth-migration:") throw new Error("这不是 Google Authenticator 迁移二维码");
  const encoded = url.searchParams.get("data");
  if (!encoded) throw new Error("迁移二维码缺少 data 参数");

  const reader = new ProtobufReader(base64ToBytes(encoded));
  const items: ParsedOtpAuth[] = [];
  let skipped = 0;
  let version = 1;
  let batchSize = 1;
  let batchIndex = 0;
  let batchId = 0;

  while (!reader.done) {
    const { field, wire } = reader.readTag();
    if (field === 1 && wire === 2) {
      const item = parseOtpParameters(reader.readBytes());
      if (item) items.push(item);
      else skipped += 1;
    } else if (field === 2 && wire === 0) version = reader.readVarint();
    else if (field === 3 && wire === 0) batchSize = reader.readVarint();
    else if (field === 4 && wire === 0) batchIndex = reader.readVarint();
    else if (field === 5 && wire === 0) batchId = reader.readInt32();
    else reader.skip(wire);
  }

  batchSize = batchSize || 1;
  if (batchSize < 1 || batchSize > 100 || batchIndex < 0 || batchIndex >= batchSize) {
    throw new Error("迁移二维码的批次信息无效");
  }
  if (version < 0 || version > 10) throw new Error("不支持该 Google Authenticator 迁移版本");
  if (!items.length && !skipped) throw new Error("迁移二维码中没有验证器");

  return { items, skipped, version, batchSize, batchIndex, batchId };
}
