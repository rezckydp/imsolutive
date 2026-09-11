// Reads the identity middleware.ts already verified and forwarded as
// headers, so route handlers don't need to re-verify the session cookie.

import type { NextRequest } from 'next/server';
import type { Role } from '@/lib/auth';

export interface CurrentUser {
  id: string;
  username: string;
  role: Role;
}

export function getCurrentUser(request: NextRequest): CurrentUser | null {
  const id = request.headers.get('x-user-id');
  const username = request.headers.get('x-user-name');
  const role = request.headers.get('x-user-role') as Role | null;
  if (!id || !username || !role) return null;
  return { id, username, role };
}

// Returns the current user only if they're an Admin — use to gate
// admin-only routes (e.g. Account Management, Activity Log restore).
export function requireAdmin(request: NextRequest): CurrentUser | null {
  const user = getCurrentUser(request);
  return user?.role === 'ADMIN' ? user : null;
}
