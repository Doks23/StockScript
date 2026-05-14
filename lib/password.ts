import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedBuffer = (await scryptAsync(password, salt, 64)) as Buffer;
  const hash = derivedBuffer.toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");

  if (!salt || !key) {
    return false;
  }

  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const originalKey = Buffer.from(key, "hex");

  if (derivedKey.length !== originalKey.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, originalKey);
}
