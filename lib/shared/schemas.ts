import { z } from "zod";

const base64Url = z.string().min(16).max(100_000).regex(/^[A-Za-z0-9_-]+$/);

export const vaultEnvelopeSchema = z.object({
  version: z.literal(1),
  kdf: z.object({
    name: z.literal("PBKDF2-SHA256"),
    iterations: z.number().int().min(310_000).max(2_000_000),
    salt: base64Url.max(128),
  }),
  wrap: z.object({
    algorithm: z.literal("AES-256-GCM"),
    iv: base64Url.max(128),
    ciphertext: base64Url.max(1024),
  }),
});

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "用户名至少需要 3 个字符")
  .max(40, "用户名最多 40 个字符")
  .regex(/^[\p{L}\p{N}._-]+$/u, "用户名只能包含文字、数字、点、下划线和连字符");

export const passwordSchema = z
  .string()
  .min(12, "主密码至少需要 12 个字符")
  .max(128, "主密码最多 128 个字符");

export const vaultItemSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["totp", "hotp"]),
    issuer: z.string().trim().min(1, "请输入服务名称").max(80),
    accountName: z.string().trim().max(120),
    secret: z.string().min(16).max(256).regex(/^[A-Z2-7]+=*$/, "密钥必须是有效的 Base32"),
    algorithm: z.enum(["SHA1", "SHA256", "SHA512"]),
    digits: z.number().int().min(6).max(8),
    period: z.number().int().min(15).max(120),
    counter: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    notes: z.string().max(2_000),
    group: z.string().trim().max(60),
    tags: z.array(z.string().trim().min(1).max(30)).max(10),
    favorite: z.boolean(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((value, context) => {
    if (value.type === "totp" && !Number.isFinite(value.period)) {
      context.addIssue({ code: "custom", path: ["period"], message: "TOTP 周期无效" });
    }
  });

export const encryptedItemInputSchema = z.object({
  id: z.string().uuid(),
  version: z.literal(1),
  ciphertext: base64Url.max(100_000),
  iv: base64Url.max(128),
  sortOrder: z.number().finite().min(-1_000_000).max(1_000_000).default(0),
});

export const encryptedItemPatchSchema = z
  .object({
    version: z.literal(1).optional(),
    ciphertext: base64Url.max(100_000).optional(),
    iv: base64Url.max(128).optional(),
    sortOrder: z.number().finite().min(-1_000_000).max(1_000_000).optional(),
    deletedAt: z.string().datetime().nullable().optional(),
    lastUsedAt: z.string().datetime().nullable().optional(),
  })
  .superRefine((value, context) => {
    const encryptedParts = [value.version, value.ciphertext, value.iv].filter((part) => part !== undefined).length;
    if (encryptedParts > 0 && encryptedParts < 3) {
      context.addIssue({ code: "custom", message: "更新密文时必须同时提供版本、密文和 IV" });
    }
    if (encryptedParts === 0 && value.sortOrder === undefined && value.deletedAt === undefined && value.lastUsedAt === undefined) {
      context.addIssue({ code: "custom", message: "没有可更新的字段" });
    }
  });

export const preferencesSchema = z.object({
  autoLockMinutes: z.number().int().min(1).max(120),
  backgroundLockMinutes: z.number().int().min(0).max(60),
  clipboardClearSeconds: z.number().int().min(0).max(120),
  viewMode: z.enum(["compact", "comfortable"]),
  sortMode: z.enum(["favorite", "name", "recent", "created", "manual"]),
});

export const setupInputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  envelope: vaultEnvelopeSchema,
});

export const loginInputSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
  envelope: vaultEnvelopeSchema,
  revokeOtherSessions: z.boolean().default(true),
});

export const batchItemsSchema = z.object({
  items: z.array(encryptedItemInputSchema.extend({
    createdAt: z.string().datetime().optional(),
    deletedAt: z.string().datetime().nullable().optional(),
  })).min(1).max(500),
  strategy: z.enum(["skip", "replace"]).default("skip"),
});
