// ---------------------------------------------------------------------------
// Auth primitives — password hashing + signed session cookies.
// Uses only Web Crypto (crypto.subtle) so this file stays Edge Runtime
// compatible (it's imported by middleware.ts). DB-backed login lives in
// auth-db.ts instead, since Prisma can't run on the Edge runtime.
// ---------------------------------------------------------------------------

export type Role = 'ADMIN' | 'STAFF';

export interface SessionPayload {
  uid: string;
  u: string; // username
  r: Role;
  iat: number; // issued-at, ms epoch
}

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PBKDF2_ITERATIONS = 100_000;

export function getCredentials(): { username: string; password: string } {
  const username = process.env.AUTH_USERNAME || 'admin';
  const password = process.env.AUTH_PASSWORD;
  if (!password) throw new Error('AUTH_PASSWORD is not set in .env');
  return { username, password };
}

// Re-used as the HMAC signing secret for session cookies.
function getSessionSecret(): string {
  const token = process.env.AUTH_TOKEN;
  if (!token) throw new Error('AUTH_TOKEN is not set in .env');
  return token;
}

// ---------------------------------------------------------------------------
// base64url helpers (Web Crypto works with raw bytes, cookies need text)
// ---------------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2-SHA256, salted) — no native deps, Edge-compatible
// ---------------------------------------------------------------------------

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const computed = toHex(await pbkdf2(password, fromHex(saltHex)));
  if (computed.length !== hashHex.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Signed session cookie (HMAC-SHA256) — carries userId/username/role so
// middleware can authorize requests without touching the database.
// ---------------------------------------------------------------------------

async function getHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionCookie(
  user: { id: string; username: string; role: Role }
): Promise<{ value: string; maxAge: number }> {
  const payload: SessionPayload = { uid: user.id, u: user.username, r: user.role, iat: Date.now() };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sig));

  return {
    value: `${payloadB64}.${sigB64}`,
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  };
}

export async function verifySessionCookie(cookieValue: string): Promise<SessionPayload | null> {
  try {
    const [payloadB64, sigB64] = cookieValue.split('.');
    if (!payloadB64 || !sigB64) return null;

    const key = await getHmacKey();
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const payload: SessionPayload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (Date.now() - payload.iat > SESSION_MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export const COOKIE_NAME = 'solutive_session';
