import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/current-user';
import { hashPassword } from '@/lib/auth';

// GET all team accounts — Admin only
export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await db.user.findMany({
    select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(users);
}

// POST create a new team account — Admin only
export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { username, password, name, role } = body;

  if (!username || !password) {
    return NextResponse.json({ error: 'Username dan password harus diisi' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: 'Username sudah dipakai' }, { status: 409 });
  }

  const user = await db.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      name: name || username,
      role: role === 'ADMIN' ? 'ADMIN' : 'STAFF',
    },
    select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
  });

  return NextResponse.json(user, { status: 201 });
}
