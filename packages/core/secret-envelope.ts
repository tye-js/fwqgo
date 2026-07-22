import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";
const KEY_ID = /^[a-z0-9._-]{1,64}$/i;
const MASKS = new Set(["********", "••••••••"]);

type Keyring = { activeKeyId: string; keys: Map<string, Buffer> };

export type DecryptedSecret = {
  value: string;
  encrypted: boolean;
  needsMigration: boolean;
  keyId: string | null;
};

function decodeKey(value: string) {
  const normalized = value.trim();
  const key = /^[a-f0-9]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64url");
  if (key.length !== 32) {
    throw new Error("密钥必须是 32 字节，并使用 base64url、base64 或 64 位十六进制编码");
  }
  return key;
}

function readKeys(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return new Map<string, Buffer>();
  let entries: Array<[string, string]>;
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("SECRET_ENCRYPTION_KEYS 必须是 JSON 对象或 keyId:key 列表");
    }
    entries = Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
  } else {
    entries = trimmed.split(",").map((item) => {
      const index = item.indexOf(":");
      if (index <= 0) throw new Error("SECRET_ENCRYPTION_KEYS 列表项必须使用 keyId:key 格式");
      return [item.slice(0, index).trim(), item.slice(index + 1).trim()];
    });
  }
  const keys = new Map<string, Buffer>();
  for (const [id, encoded] of entries) {
    if (!KEY_ID.test(id)) throw new Error(`密钥 ID ${id || "(空)"} 格式无效`);
    keys.set(id, decodeKey(encoded));
  }
  return keys;
}

function keyring(): Keyring | null {
  const serialized = process.env.SECRET_ENCRYPTION_KEYS?.trim();
  const single = process.env.SECRET_ENCRYPTION_KEY?.trim();
  const keys = serialized
    ? readKeys(serialized)
    : single
      ? new Map([["default", decodeKey(single)]])
      : new Map<string, Buffer>();
  if (keys.size === 0) return null;
  const activeKeyId =
    process.env.SECRET_ENCRYPTION_ACTIVE_KEY_ID?.trim() ?? keys.keys().next().value;
  if (!activeKeyId || !keys.has(activeKeyId)) {
    throw new Error("SECRET_ENCRYPTION_ACTIVE_KEY_ID 未指向已配置的密钥");
  }
  return { activeKeyId, keys };
}

function aad(keyId: string) {
  return Buffer.from(`${PREFIX}:${keyId}`, "utf8");
}

export function isEncryptedSecret(value: string | null | undefined) {
  return Boolean(value?.startsWith(`${PREFIX}:`));
}

export function isMaskedSecret(value: string | null | undefined) {
  return Boolean(value && MASKS.has(value.trim()));
}

export function hasSecretEncryptionKey() {
  return keyring() !== null;
}

export function encryptSecret(value: string) {
  const plaintext = value.trim();
  if (!plaintext) throw new Error("不能加密空密钥");
  if (isEncryptedSecret(plaintext)) return plaintext;
  const ring = keyring();
  if (!ring) {
    throw new Error("保存密钥前请配置 SECRET_ENCRYPTION_KEYS（或 SECRET_ENCRYPTION_KEY）");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ring.keys.get(ring.activeKeyId)!, iv);
  cipher.setAAD(aad(ring.activeKeyId));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    PREFIX,
    ring.activeKeyId,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string): DecryptedSecret {
  if (!isEncryptedSecret(value)) {
    return { value, encrypted: false, needsMigration: Boolean(value.trim()), keyId: null };
  }
  const parts = value.split(":");
  if (parts.length !== 6 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("加密密钥格式无效");
  }
  const keyId = parts[2]!;
  const ring = keyring();
  const key = ring?.keys.get(keyId);
  if (!key) throw new Error(`无法解密密钥：未配置 keyId=${keyId}`);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[3]!, "base64url"));
    decipher.setAAD(aad(keyId));
    decipher.setAuthTag(Buffer.from(parts[5]!, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(parts[4]!, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return {
      value: plaintext,
      encrypted: true,
      needsMigration: keyId !== ring!.activeKeyId,
      keyId,
    };
  } catch {
    throw new Error("密钥解密失败：数据已损坏或主密钥不匹配");
  }
}

export function prepareSecretForStorage(input: string | null | undefined, existing?: string | null) {
  const value = input?.trim() ?? "";
  if (!value || isMaskedSecret(value)) return existing ?? null;
  return encryptSecret(value);
}

export function maskStoredSecret(value: string | null | undefined) {
  return value ? "********" : null;
}
