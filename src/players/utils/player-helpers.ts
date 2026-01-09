/**
 * Player utilities for join codes and QR codes
 */

export function generatePlayerJoinCode(): string {
  // Generate 8-character alphanumeric code for better uniqueness
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export function validateJoinCode(code: string): boolean {
  // Join code should be 8 characters, alphanumeric
  return /^[A-Z0-9]{8}$/.test(code);
}
