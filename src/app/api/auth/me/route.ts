import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

export async function GET(request: NextRequest) {
  const session = getCurrentUser(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read `name` fresh from the DB (not carried in the session cookie) so a
  // rename in Account Management shows up immediately without re-login.
  const user = await db.user.findUnique({
    where: { id: session.id },
    select: { id: true, username: true, name: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(user);
}
