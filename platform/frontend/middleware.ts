import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware — Route-level auth guard
 * Redirects unauthenticated users away from /dashboard/* before serving JS bundles
 */
export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const { pathname } = request.nextUrl;

  // Protected routes — require auth
  // When the API is cross-origin (e.g. Cloudflare Tunnel), the httpOnly cookie
  // lives on the API domain and is invisible to this middleware. In that case
  // we let the page load and rely on the client-side AuthContext/ProtectedRoute
  // to redirect unauthenticated users. The middleware only blocks when it can
  // confirm there is NO cookie AND the API is same-origin (cookie would be visible).
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const isCrossOriginAPI = apiUrl && !apiUrl.startsWith(request.nextUrl.origin);

  if (pathname.startsWith('/dashboard')) {
    if (!token && !isCrossOriginAPI) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Redirect authenticated users away from login/register
  // Skip redirect if sessionExpired param is present (cookie is stale/being cleared)
  const sessionExpired = request.nextUrl.searchParams.get('sessionExpired');
  if ((pathname === '/login' || pathname === '/register') && token && !sessionExpired) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register'],
};
