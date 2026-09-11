import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie, COOKIE_NAME } from '@/lib/auth';

// Routes that don't require authentication
const publicPaths = ['/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = sessionCookie ? await verifySessionCookie(sessionCookie) : null;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    // If already logged in and trying to access /login, redirect to dashboard
    if (session) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Allow the login/logout endpoint itself, unauthenticated. Other /api/auth/*
  // routes (e.g. /api/auth/me) fall through to the normal /api/ check below.
  if (pathname === '/api/auth') {
    return NextResponse.next();
  }

  // For API routes, check session and return 401 if not authenticated.
  // Forward the identity as headers so route handlers can read it without
  // re-verifying the cookie themselves (e.g. to gate admin-only endpoints).
  if (pathname.startsWith('/api/')) {
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const headers = new Headers(request.headers);
    headers.set('x-user-id', session.uid);
    headers.set('x-user-name', session.u);
    headers.set('x-user-role', session.r);
    return NextResponse.next({ request: { headers } });
  }

  // For all other pages, check session and redirect to login if not authenticated
  if (!session) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Run middleware on all paths
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt).*)',
  ],
};
