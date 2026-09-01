"use client";

import * as OTPAuth from "otpauth";
import type { OtpAlgorithm, OtpType, VaultItem } from "@/lib/shared/types";

const BASE32_PATTERN = /^[A-Z2-7]+=*$/;

export interface ParsedOtpAuth {
  type: OtpType;
  issuer: string;
  accountName: string;
  secret: string;
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
  counter: number;
}

export function normalizeSecret(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/g, "");
}

export function isValidBase32(value: string): boolean {
  const secret = normalizeSecret(value);
  if (secret.length < 16 || !BASE32_PATTERN.test(secret)) return false;
  try {
    return OTPAuth.Secret.fromBase32(secret).buffer.byteLength >= 10;
  } catch {
    return false;
  }
}

function parseInteger(value: string | null, fallback: number, minimum: number, maximum: number): number {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error("OTP 参数超出允许范围");
  return parsed;
}

export function parseOtpAuthUri(raw: string): ParsedOtpAuth {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("这不是有效的 otpauth 链接");
  }
  if (url.protocol !== "otpauth:") throw new Error("仅支持 otpauth:// 链接");
  const type = url.hostname.toLowerCase();
  if (type !== "totp" && type !== "hotp") throw new Error("仅支持 TOTP 或 HOTP");

  const secret = normalizeSecret(url.searchParams.get("secret") || "");
  if (!isValidBase32(secret)) throw new Error("链接中的 Base32 密钥无效");

  const rawLabel = decodeURIComponent(url.pathname.replace(/^\//, "")).trim();
  const separator = rawLabel.indexOf(":");
  const labelIssuer = separator >= 0 ? rawLabel.slice(0, separator).trim() : "";
  const accountName = (separator >= 0 ? rawLabel.slice(separator + 1) : rawLabel).trim();
  const issuer = (url.searchParams.get("issuer") || labelIssuer || "未命名服务").trim();
  const algorithmValue = (url.searchParams.get("algorithm") || "SHA1").replace(/-/g, "").toUpperCase();
  if (!["SHA1", "SHA256", "SHA512"].includes(algorithmValue)) throw new Error("不支持该 OTP 算法");
  const digits = parseInteger(url.searchParams.get("digits"), 6, 6, 8);
  const period = parseInteger(url.searchParams.get("period"), 30, 15, 120);
  const counter = parseInteger(url.searchParams.get("counter"), 0, 0, Number.MAX_SAFE_INTEGER);

  return {
    type,
    issuer: issuer.slice(0, 80),
    accountName: accountName.slice(0, 120),
    secret,
    algorithm: algorithmValue as OtpAlgorithm,
    digits,
    period,
    counter,
  };
}

export function generateOtp(item: VaultItem, timestamp = Date.now()): string {
  const secret = OTPAuth.Secret.fromBase32(normalizeSecret(item.secret));
  if (item.type === "hotp") {
    return new OTPAuth.HOTP({ algorithm: item.algorithm, digits: item.digits, secret }).generate({ counter: item.counter });
  }
  return new OTPAuth.TOTP({ algorithm: item.algorithm, digits: item.digits, period: item.period, secret }).generate({ timestamp });
}

export function otpTimeRemaining(period: number, timestamp = Date.now()): number {
  const elapsed = Math.floor(timestamp / 1000) % period;
  return period - elapsed;
}

export function toOtpAuthUri(item: VaultItem): string {
  const label = `${item.issuer}:${item.accountName || item.issuer}`;
  const params = new URLSearchParams({
    secret: normalizeSecret(item.secret),
    issuer: item.issuer,
    algorithm: item.algorithm,
    digits: String(item.digits),
  });
  if (item.type === "totp") params.set("period", String(item.period));
  else params.set("counter", String(item.counter));
  return `otpauth://${item.type}/${encodeURIComponent(label)}?${params.toString()}`;
}

export function otpFingerprint(item: Pick<VaultItem, "type" | "secret">): string {
  return `${item.type}:${normalizeSecret(item.secret)}`;
}
