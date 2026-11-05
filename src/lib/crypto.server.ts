import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Connection keys from App User Connectors use the platform-provisioned key;
// user-entered credentials (Jira tokens, AI keys) use CREDENTIALS_ENCRYPTION_KEY.
type KeyName = "APP_USER_CONNECTION_KEY_SECRET" | "CREDENTIALS_ENCRYPTION_KEY";

function key(name: KeyName): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set`);
  if (name === "APP_USER_CONNECTION_KEY_SECRET") return Buffer.from(raw, "base64");
  return createHash("sha256").update(raw).digest();
}

export function encrypt(plaintext: string, name: KeyName = "CREDENTIALS_ENCRYPTION_KEY"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(name), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decrypt(stored: string, name: KeyName = "CREDENTIALS_ENCRYPTION_KEY"): string {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(name), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export function keyNameFor(connectorId: string): KeyName {
  return connectorId === "jira" ? "CREDENTIALS_ENCRYPTION_KEY" : "APP_USER_CONNECTION_KEY_SECRET";
}
