import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';

export async function GET(request: NextRequest) {
  const user = getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(user);
}
