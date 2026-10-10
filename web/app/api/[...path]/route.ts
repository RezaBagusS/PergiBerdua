import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY = 16_384;
const allowed = new Set([
  'GET health', 'GET config', 'GET me', 'GET room',
  'POST auth/request', 'POST auth/verify', 'POST auth/logout',
  'POST preferences', 'POST rooms/create', 'POST rooms/leave',
  'POST rooms/profile', 'POST invites/create', 'POST invites/accept',
  'POST places/save', 'POST places/action'
]);
type Context = {params: Promise<{path: string[]}>};
const jsonError = (error: string, status: number) =>
  Response.json({error}, {status, headers: {'Cache-Control': 'no-store'}});

async function forward(request: NextRequest, context: Context) {
  const {path} = await context.params;
  const endpoint = path.join('/');
  if (!allowed.has(`${request.method} ${endpoint}`)) return jsonError('Endpoint tidak ditemukan.', 404);
  const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== origin) return jsonError('Origin tidak diizinkan.', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return jsonError('Gunakan application/json.', 415);
  }
  try {
    let body: string | undefined;
    if (request.method === 'POST') {
      // Stream limit: do not buffer an unbounded request body.
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_BODY) {
            await reader.cancel();
            return jsonError('Data terlalu besar.', 413);
          }
          chunks.push(chunk.value);
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
      body = new TextDecoder().decode(bytes);
    }
    // Fixed, server-only upstream; never derived from user-controlled URL/host.
    const target = new URL(`/api/${endpoint}`, process.env.API_INTERNAL_URL || 'http://api:3000');
    target.search = request.nextUrl.search;
    const headers = new Headers({'Content-Type': 'application/json'});
    const cookies = request.headers.get('cookie');
    if (cookies) headers.set('cookie', cookies);
    const incomingOrigin = request.headers.get('origin');
    if (incomingOrigin) headers.set('origin', incomingOrigin);
    const upstream = await fetch(target, {
      method: request.method, headers, body, cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(30_000)
    });
    const responseHeaders = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    // Session cookie is HttpOnly and remains scoped to the public Next origin.
    for (const value of upstream.headers.getSetCookie()) responseHeaders.append('Set-Cookie', value);
    return new Response(await upstream.text(), {status: upstream.status, headers: responseHeaders});
  } catch {
    return jsonError('Layanan belum tersedia. Coba lagi sebentar.', 503);
  }
}
export const GET = forward;
export const POST = forward;
