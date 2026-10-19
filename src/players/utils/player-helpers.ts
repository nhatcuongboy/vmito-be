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

/**
 * Players are WAITING from the moment they join, even before the session
 * starts. Once a session runs with autoCheckIn off, newcomers are not checked
 * in yet, so they start paused until the host checks them in.
 */
export function initialPlayerStatus(session: {
  status: string;
  autoCheckIn: boolean;
}): 'WAITING' | 'INACTIVE' {
  return session.status === 'IN_PROGRESS' && !session.autoCheckIn
    ? 'INACTIVE'
    : 'WAITING';
}
