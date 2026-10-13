import argon2 from "argon2";
import { randomBytes } from "node:crypto";

/**
 * Password hashing with argon2id.
 *
 * argon2id over bcrypt: bcrypt silently truncates anything past 72 bytes, and its design is
 * cheaper to attack on GPUs. argon2id is memory-hard, so parallel cracking hardware buys much
 * less. The parameters below are the OWASP baseline (19 MiB, 2 iterations, 1 lane).
 *
 * NOTE: `argon2` is a native module. If it will not build on a target machine, swapping in the
 * pure-JS `bcryptjs` only requires changing this file.
 */

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, HASH_OPTIONS);
}

/** Returns false rather than throwing when the stored hash is malformed. */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * A dummy verify against a fixed hash.
 *
 * Called when an email does not exist, so that "unknown email" and "wrong password" take the
 * same amount of time. Without it, response latency leaks which accounts are registered.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c2VtaWNvZHVtbXlzYWx0$0000000000000000000000000000000000000000000";

export async function burnPasswordTime(plain: string): Promise<void> {
  await verifyPassword(DUMMY_HASH, plain);
}

/**
 * A one-time password for invited workers and resets.
 *
 * Built from an unambiguous alphabet — no O/0 or I/1 — because these get read aloud or typed from
 * a phone screen. Guaranteed to satisfy the 8-character minimum enforced by the signup schema.
 *
 * There is no email delivery in this project, so the owner relays this to the worker out of band.
 * That is a deliberate limitation, documented in server/README.md, not an oversight.
 */
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateTemporaryPassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += TEMP_ALPHABET[(bytes[i] as number) % TEMP_ALPHABET.length];
  }
  // Guarantee at least one digit and one letter so the value cannot trip a future complexity rule.
  return `${out}7a`;
}
