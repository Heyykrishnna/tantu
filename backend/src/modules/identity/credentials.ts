import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { Failure } from "../../platform/failure.js";

const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => { if (error) reject(error); else resolve(key); });
  });
}

export function digest(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
export function secret(): string { return randomBytes(32).toString("base64url"); }

export function validatePassword(password: string): void {
  if (password.length < 12 || Buffer.byteLength(password) > 256) throw new Failure(400, "PASSWORD_POLICY", "Use a password of at least 12 characters and at most 256 bytes.");
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, expected] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !expected || !/^[a-f0-9]{128}$/.test(expected) || Buffer.byteLength(password) > 256) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
