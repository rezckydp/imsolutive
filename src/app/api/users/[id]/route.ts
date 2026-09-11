import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/current-user';
import { hashPassword } from '@/lib/auth';

// PUT update a team account (role, active state, name, or reset password) — Admin only
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name, role, isActive, password } = body;

  const target = await db.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
  }

  // Never allow the last active Admin to be demoted/deactivated — that would
  // lock everyone out of Account Management with no way back in.
  const wouldLoseAdminAccess =
    target.role === 'ADMIN' &&
    target.isActive &&
    ((role !== undefined && role !== 'ADMIN') || isActive === false);
  if (wouldLoseAdminAccess) {
    const otherActiveAdmins = await db.user.count({
      where: { role: 'ADMIN', isActive: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      return NextResponse.json(
        { error: 'Tidak bisa menonaktifkan atau mengubah role Admin terakhir' },
        { status: 400 }
      );
    }
  }

  const data: { name?: string; role?: string; isActive?: boolean; passwordHash?: string } = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role === 'ADMIN' ? 'ADMIN' : 'STAFF';
  if (isActive !== undefined) data.isActive = !!isActive;
  if (password) {
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 });
    }
    data.passwordHash = await hashPassword(password);
  }

  const updated = await db.user.update({
    where: { id },
    data,
    select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
  });

  return NextResponse.json(updated);
}
