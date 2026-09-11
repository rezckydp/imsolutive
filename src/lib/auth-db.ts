// ---------------------------------------------------------------------------
// DB-backed login. Kept separate from auth.ts because Prisma can't run on
// the Edge runtime, and auth.ts is imported by middleware.ts (Edge).
// ---------------------------------------------------------------------------

import { db } from '@/lib/db';
import { getCredentials, hashPassword, verifyPassword, type Role } from '@/lib/auth';

export interface AuthedUser {
  id: string;
  username: string;
  role: Role;
}

export async function login(username: string, password: string): Promise<AuthedUser | null> {
  const userCount = await db.user.count();

  // First-run bootstrap: no accounts exist yet — migrate the old shared
  // .env login into the first Admin account, once, on its first successful use.
  if (userCount === 0) {
    const creds = getCredentials();
    if (username !== creds.username || password !== creds.password) return null;

    const user = await db.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        name: username,
        role: 'ADMIN',
      },
    });
    return { id: user.id, username: user.username, role: user.role as Role };
  }

  const user = await db.user.findUnique({ where: { username } });
  if (!user || !user.isActive) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;

  return { id: user.id, username: user.username, role: user.role as Role };
}
