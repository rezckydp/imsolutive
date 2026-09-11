import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/current-user';

// GET recent activity log entries — Admin only
export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType');
  const take = Math.min(Number(searchParams.get('take')) || 100, 200);

  const logs = await db.activityLog.findMany({
    where: entityType ? { entityType } : undefined,
    orderBy: { createdAt: 'desc' },
    take,
  });

  return NextResponse.json(logs);
}
