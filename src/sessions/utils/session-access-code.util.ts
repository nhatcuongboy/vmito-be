import * as crypto from 'crypto';

// Character set excluding easily confused characters: 0, O, 1, I
const CODE_CHARACTERS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates an uppercase alphanumeric access code of the specified length.
 * Default length is 8 characters.
 */
export function generateSessionAccessCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CODE_CHARACTERS[bytes[i] % CODE_CHARACTERS.length];
  }
  return result;
}
