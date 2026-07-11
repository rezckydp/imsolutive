import { NextRequest, NextResponse } from 'next/server';
import { login, createSessionCookie, COOKIE_NAME } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, username, password } = body;

    // ---- LOGIN ----
    if (action === 'login') {
      if (!username || !password) {
        return NextResponse.json(
          { error: 'Username dan password harus diisi' },
          { status: 400 }
        );
      }

      const isValid = login(username, password);
      if (!isValid) {
        return NextResponse.json(
          { error: 'Username atau password salah' },
          { status: 401 }
        );
      }

      const session = createSessionCookie();

      const res = NextResponse.json(
        { success: true, message: 'Login berhasil' },
        { status: 200 }
      );

      // Set the session cookie (httpOnly, sameSite)
      // Note: secure flag is false because most VPS deployments use HTTP without SSL.
      // Set to true only if you have HTTPS configured (e.g. via Cloudflare or Let's Encrypt).
      res.cookies.set(COOKIE_NAME, session.value, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: session.maxAge,
      });

      return res;
    }

    // ---- LOGOUT ----
    if (action === 'logout') {
      const res = NextResponse.json(
        { success: true, message: 'Logout berhasil' },
        { status: 200 }
      );

      // Clear the session cookie
      res.cookies.set(COOKIE_NAME, '', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });

      return res;
    }

    return NextResponse.json(
      { error: 'Action tidak valid' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}
