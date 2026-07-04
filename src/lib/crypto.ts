import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

function getKey() {
  const secret = process.env.APP_SECRET || "local-dev-secret-change-me";
  return crypto.scryptSync(secret, "douyin-local-life-session-vault", 32);
}

export function encryptJson(payload: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, getKey(), iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedPayload: encrypted.toString("base64"),
    encryptionMeta: JSON.stringify({
      algorithm,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      version: 1
    })
  };
}

export function decryptJson<T>(encryptedPayload: string, encryptionMeta: string): T {
  const meta = JSON.parse(encryptionMeta) as {
    algorithm: string;
    iv: string;
    authTag: string;
  };
  if (meta.algorithm !== algorithm) {
    throw new Error("Unsupported encryption algorithm");
  }

  const decipher = crypto.createDecipheriv(algorithm, getKey(), Buffer.from(meta.iv, "base64"));
  decipher.setAuthTag(Buffer.from(meta.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPayload, "base64")),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}
