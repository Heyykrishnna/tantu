import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Failure } from "../../platform/failure.js";
import { object, string } from "../../platform/value.js";
export { object, string, array } from "../../platform/value.js";
export function seal(value: unknown, key: Buffer | null, context: string): object {
  if (!key) throw new Failure(503, "PROVIDER_DISABLED", "Provider connections require an operator-configured encryption key.");
  const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, nonce); cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return { version: 1, nonce: nonce.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), data: data.toString("base64url") };
}
export function open(value: unknown, key: Buffer | null, context: string): Record<string, unknown> {
  if (!key) throw new Failure(503, "PROVIDER_DISABLED", "Provider token decryption is unavailable.");
  const envelope = object(value); if (envelope.version !== 1) throw new Error("Unsupported vault key version.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(string(envelope.nonce), "base64url")); decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(string(envelope.tag), "base64url"));
  const decoded: unknown = JSON.parse(Buffer.concat([decipher.update(Buffer.from(string(envelope.data), "base64url")), decipher.final()]).toString("utf8")); return object(decoded);
}
