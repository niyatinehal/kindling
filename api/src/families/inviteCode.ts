import { randomBytes } from "node:crypto";

/**
 * Crockford base32 — no I, L, O, or U. An invite code gets read aloud across a
 * kitchen table and typed by a 63-year-old, so the alphabet excludes the glyphs
 * people confuse and the one that forms unintended words.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 10;

/**
 * A single-use family invite code.
 *
 * `randomBytes`, never `Math.random`: the design doc names weak generation as a
 * risk because this code is the entire authorisation to join a family and read
 * its health data. 10 Crockford characters is ~50 bits, and codes also expire and
 * are single-use, so guessing has to win against a moving target.
 *
 * Rejection sampling rather than `% 32` — 256 is divisible by 32 so the modulo
 * would be uniform here, but that is a property of the current alphabet length,
 * not of the code. Sampling stays correct if the alphabet ever changes.
 */
export function generateInviteCode(): string {
  const limit = 256 - (256 % ALPHABET.length);
  let code = "";

  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte >= limit) {
        continue;
      }
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === CODE_LENGTH) {
        break;
      }
    }
  }

  return code;
}
