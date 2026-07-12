// ---------------------------------------------------------------------------
// Simple token-based auth for single-user personal app
// No crypto dependency — works in both Node.js and Edge Runtime (middleware)
// ---------------------------------------------------------------------------

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCredentials(): { username: string; password: string } {
  const username = process.env.AUTH_USERNAME || 'admin';
  const password = process.env.AUTH_PASSWORD;
  if (!password) throw new Error('AUTH_PASSWORD is not set in .env');
  return { username, password };
}

function getAuthToken(): string {
  const token = process.env.AUTH_TOKEN;
  if (!token) throw new Error('AUTH_TOKEN is not set in .env');
  return token;
}

// ---------------------------------------------------------------------------
// Login helper
// ---------------------------------------------------------------------------

export function login(username: string, password: string): boolean {
  const creds = getCredentials();
  if (username !== creds.username) return false;
  if (password !== creds.password) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Session cookie helpers (works in Edge Runtime — no crypto needed)
// ---------------------------------------------------------------------------

export function createSessionCookie(): { value: string; maxAge: number } {
  // Simple timestamp + token format: timestamp.token
  const timestamp = Date.now().toString(36);
  const token = getAuthToken();
  const value = `${timestamp}.${token}`;

  return {
    value,
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  };
}

/**
 * Verify a session cookie value.
 * Returns true if the token matches and the session hasn't expired.
 */
export function verifySessionCookie(cookieValue: string): boolean {
  try {
    const parts = cookieValue.split('.');
    if (parts.length !== 2) return false;

    const [timestamp, token] = parts;

    // Verify token matches
    if (token !== getAuthToken()) return false;

    // Check expiry (7 days)
    const issuedAt = parseInt(timestamp, 36);
    if (Date.now() - issuedAt > SESSION_MAX_AGE_MS) return false;

    return true;
  } catch {
    return false;
  }
}

export const COOKIE_NAME = 'solutive_session';
