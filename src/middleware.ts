import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function applySetCookie(from: NextResponse, to: NextResponse) {
  const setCookie = from.headers.get('set-cookie');
  if (setCookie) {
    to.headers.set('set-cookie', setCookie);
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Create a response object to modify
  let response = NextResponse.next();

  // Create Supabase server client for middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // IMPORTANT: Use getUser() instead of getSession() to properly refresh expired tokens
  // getSession() only reads cookies without refreshing, causing auth failures after token expiry
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sign-in helpers are called from the login page, before there is a session
  if (pathname.startsWith('/api/auth/')) {
    return response;
  }

  // Public routes - redirect to appropriate dashboard if already logged in
  if (pathname === '/' || pathname === '/login' || pathname.startsWith('/auth/confirm')) {
    if (user) {
      // Fetch profile to determine redirect
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const redirectPath = profile?.role === 'admin' 
        ? '/admin' 
        : profile?.role === 'manager' 
          ? '/manager' 
          : '/employee';

      const redirectResponse = NextResponse.redirect(new URL(redirectPath, request.url));
      applySetCookie(response, redirectResponse);
      return redirectResponse;
    }
    return response;
  }

  // Protected routes - require authentication
  if (!user) {
    const redirectResponse = NextResponse.redirect(new URL('/login', request.url));
    applySetCookie(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
