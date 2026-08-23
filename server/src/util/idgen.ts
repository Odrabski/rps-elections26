import { randomUUID } from 'node:crypto';

// No ambiguous chars (0/O, 1/I) so a spoken/typed room code isn't error-prone.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 4): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function generateToken(): string {
  return randomUUID();
}
