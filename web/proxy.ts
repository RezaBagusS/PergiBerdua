import { NextResponse, type NextRequest } from 'next/server';

// Nonce allows Next's hydration scripts without unsafe-inline in script-src.
// This is not an authorization boundary; all data access is checked by the API.
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({request: {headers}});
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'no-store');
  if (process.env.COOKIE_SECURE === 'true') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  return response;
}
export const config = {matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)']};
