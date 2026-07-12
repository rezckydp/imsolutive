import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie, COOKIE_NAME, getAuthToken } from '@/lib/auth';

// Routes that don't require authentication
const publicPaths = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    // If already logged in and trying to access /login, redirect to dashboard
    const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
    if (sessionCookie && verifySessionCookie(sessionCookie)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Allow API auth route (login/logout endpoint itself)
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // For API routes, check session and return 401 if not authenticated
  if (pathname.startsWith('/api/')) {
    const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
    if (!sessionCookie || !verifySessionCookie(sessionCookie)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // For all other pages, check session and redirect to login if not authenticated
  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!sessionCookie || !verifySessionCookie(sessionCookie)) {
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
