"use client";

import { vaultItemSchema } from "@/lib/shared/schemas";
import type { EncryptedItemRecord, VaultEnvelope, VaultItem } from "@/lib/shared/types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const VAULT_AAD = encoder.encode("visual-2fa:vault-key:v1");
export const KDF_ITERATIONS = 600_000;

export class VaultCryptoError extends Error {
  constructor(message = "无法解锁保险库，请检查主密码或数据完整性") {
    super(message);
    this.name = "VaultCryptoError";
  }
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function deriveWrappingKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const passwordBytes = encoder.encode(password);
  try {
    const source = await crypto.subtle.importKey("raw", asBuffer(passwordBytes), "PBKDF2", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: asBuffer(salt), iterations },
      source,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    passwordBytes.fill(0);
  }
}

async function importVaultKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== 32) throw new VaultCryptoError();
  return crypto.subtle.importKey("raw", asBuffer(raw), { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function wrapRawVaultKey(rawVaultKey: Uint8Array, password: string): Promise<VaultEnvelope> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(password, salt, KDF_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBuffer(iv), additionalData: asBuffer(VAULT_AAD), tagLength: 128 },
    wrappingKey,
    asBuffer(rawVaultKey),
  );
  return {
    version: 1,
    kdf: { name: "PBKDF2-SHA256", iterations: KDF_ITERATIONS, salt: bytesToBase64Url(salt) },
    wrap: { algorithm: "AES-256-GCM", iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)) },
  };
}

export async function createVault(password: string): Promise<{ key: CryptoKey; envelope: VaultEnvelope }> {
  const raw = randomBytes(32);
  try {
    const [key, envelope] = await Promise.all([importVaultKey(raw), wrapRawVaultKey(raw, password)]);
    return { key, envelope };
  } finally {
    raw.fill(0);
  }
}

export async function unlockVault(password: string, envelope: VaultEnvelope): Promise<CryptoKey> {
  const salt = base64UrlToBytes(envelope.kdf.salt);
  const iv = base64UrlToBytes(envelope.wrap.iv);
  const ciphertext = base64UrlToBytes(envelope.wrap.ciphertext);
  try {
    const wrappingKey = await deriveWrappingKey(password, salt, envelope.kdf.iterations);
    const raw = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: asBuffer(iv), additionalData: asBuffer(VAULT_AAD), tagLength: 128 },
        wrappingKey,
        asBuffer(ciphertext),
      ),
    );
    try {
      return await importVaultKey(raw);
    } finally {
      raw.fill(0);
    }
  } catch {
    throw new VaultCryptoError();
  } finally {
    salt.fill(0);
    ciphertext.fill(0);
  }
}

export async function rewrapVaultKey(key: CryptoKey, newPassword: string): Promise<VaultEnvelope> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  try {
    return await wrapRawVaultKey(raw, newPassword);
  } finally {
    raw.fill(0);
  }
}

function itemAad(id: string): Uint8Array {
  return encoder.encode(`visual-2fa:item:${id}:v1`);
}

export async function encryptVaultItem(
  key: CryptoKey,
  item: VaultItem,
  metadata?: Partial<Pick<EncryptedItemRecord, "deletedAt" | "lastUsedAt" | "sortOrder">>,
): Promise<EncryptedItemRecord> {
  const parsed = vaultItemSchema.parse(item);
  const iv = randomBytes(12);
  const plaintext = encoder.encode(JSON.stringify(parsed));
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: asBuffer(iv), additionalData: asBuffer(itemAad(parsed.id)), tagLength: 128 },
      key,
      asBuffer(plaintext),
    );
    return {
      id: parsed.id,
      version: 1,
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
      iv: bytesToBase64Url(iv),
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      deletedAt: metadata?.deletedAt ?? null,
      lastUsedAt: metadata?.lastUsedAt ?? null,
      sortOrder: metadata?.sortOrder ?? 0,
    };
  } finally {
    plaintext.fill(0);
  }
}

export async function decryptVaultItem(key: CryptoKey, record: EncryptedItemRecord): Promise<VaultItem> {
  const iv = base64UrlToBytes(record.iv);
  const ciphertext = base64UrlToBytes(record.ciphertext);
  let plaintext: Uint8Array | undefined;
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: asBuffer(iv), additionalData: asBuffer(itemAad(record.id)), tagLength: 128 },
        key,
        asBuffer(ciphertext),
      ),
    );
    const parsed = vaultItemSchema.parse(JSON.parse(decoder.decode(plaintext)));
    if (parsed.id !== record.id) throw new VaultCryptoError("验证器数据身份不匹配");
    return parsed;
  } catch (error) {
    if (error instanceof VaultCryptoError) throw error;
    throw new VaultCryptoError("某条验证器数据已损坏或不属于当前保险库");
  } finally {
    iv.fill(0);
    ciphertext.fill(0);
    plaintext?.fill(0);
  }
}
