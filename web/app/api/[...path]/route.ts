import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY = 16_384;

const allowed = new Set([
  'GET health',
  'GET config',
  'GET me',
  'GET room',
  'GET cron/reminders',
  'POST cron/reminders',
  'POST auth/request',
  'POST auth/verify',
  'POST auth/logout',
  'POST preferences',
  'POST rooms/create',
  'POST rooms/leave',
  'POST rooms/profile',
  'POST invites/create',
  'POST invites/accept',
  'POST places/save',
  'POST places/action'
]);

type Context = { params: Promise<{ path: string[] }> };

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

async function forwardUpstream(
  request: NextRequest,
  endpoint: string,
  body: string | undefined
): Promise<Response> {
  const target = new URL(`/api/${endpoint}`, process.env.API_INTERNAL_URL);
  target.search = request.nextUrl.search;
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const cookies = request.headers.get('cookie');
  if (cookies) headers.set('cookie', cookies);
  const incomingOrigin = request.headers.get('origin');
  if (incomingOrigin) headers.set('origin', incomingOrigin);
  const host = request.headers.get('host');
  if (host) headers.set('x-forwarded-host', host);

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000)
  });

  const responseHeaders = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });

  for (const value of upstream.headers.getSetCookie()) {
    responseHeaders.append('Set-Cookie', value);
  }
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: responseHeaders
  });
}

async function handleInternal(
  request: NextRequest,
  endpoint: string,
  bodyText: string | undefined
): Promise<Response> {
  const { ApiError } = await import('../../../lib/domain');
  const server = await import('../../../lib/server');

  const responseHeaders = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });

  const cookieHeader = request.headers.get('cookie');
  const remoteIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  let parsedBody: Record<string, unknown> = {};

  if (bodyText) {
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      return jsonError('Format permintaan tidak valid.', 400);
    }
  }

  const routeKey = `${request.method} ${endpoint}`;

  try {
    switch (routeKey) {
      case 'GET health':
        return Response.json(await server.handleHealth(), { headers: responseHeaders });

      case 'GET config':
        return Response.json(server.handleConfig(), { headers: responseHeaders });

      case 'GET me':
        return Response.json(await server.handleMe(cookieHeader), { headers: responseHeaders });

      case 'GET room': {
        const id = request.nextUrl.searchParams.get('id');
        return Response.json(await server.handleRoom(cookieHeader, id), { headers: responseHeaders });
      }

      case 'GET cron/reminders':
      case 'POST cron/reminders':
        return Response.json(await server.handleCronReminders(), { headers: responseHeaders });

      case 'POST auth/request':
        return Response.json(await server.handleAuthRequest(parsedBody, remoteIp), {
          headers: responseHeaders
        });

      case 'POST auth/verify': {
        const { user, setCookie } = await server.handleAuthVerify(parsedBody, remoteIp);
        const headers = new Headers(responseHeaders);
        headers.set('Set-Cookie', setCookie);
        return Response.json({ user }, { headers });
      }

      case 'POST auth/logout': {
        const { ok, setCookie } = await server.handleAuthLogout(cookieHeader);
        const headers = new Headers(responseHeaders);
        headers.set('Set-Cookie', setCookie);
        return Response.json({ ok }, { headers });
      }

      case 'POST preferences':
        return Response.json(await server.handlePreferences(cookieHeader, parsedBody), {
          headers: responseHeaders
        });

      case 'POST rooms/create':
        return Response.json(await server.handleRoomCreate(cookieHeader, parsedBody), {
          headers: responseHeaders
        });

      case 'POST rooms/profile':
        return Response.json(await server.handleRoomProfile(cookieHeader, parsedBody), {
          headers: responseHeaders
        });

      case 'POST rooms/leave':
        return Response.json(await server.handleRoomLeave(cookieHeader, parsedBody), {
          headers: responseHeaders
        });

      case 'POST invites/create':
        return Response.json(await server.handleInviteCreate(cookieHeader, parsedBody), {
          headers: responseHeaders
        });

      case 'POST invites/accept':
        return Response.json(await server.handleInviteAccept(cookieHeader, parsedBody), {
          headers: responseHeaders
        });

      case 'POST places/save':
        return Response.json(await server.handlePlaceSave(cookieHeader, parsedBody), {
          headers: responseHeaders
        });

      case 'POST places/action':
        return Response.json(await server.handlePlaceAction(cookieHeader, parsedBody), {
          headers: responseHeaders
        });

      default:
        return jsonError('Endpoint tidak ditemukan.', 404);
    }
  } catch (err: unknown) {
    const isApiError = err instanceof ApiError;
    const e = err as { status?: number; code?: string; message?: string; name?: string };
    const status = isApiError && typeof e.status === 'number' ? e.status : e.code === '23505' ? 409 : 500;
    if (status === 500) {
      console.error('API execution error:', e.code || e.name || err);
    }
    const message =
      status === 500
        ? 'Terjadi masalah server. Coba lagi.'
        : isApiError && typeof e.message === 'string'
        ? e.message
        : 'Data sudah digunakan atau ruang berubah. Muat ulang dan coba lagi.';
    return jsonError(message, status);
  }
}

function isAllowedOrigin(originHeader: string | null, request: NextRequest): boolean {
  if (!originHeader) return false;
  const configured = process.env.APP_ORIGIN || 'http://localhost:3000';
  if (originHeader === configured) return true;

  const isProduction = process.env.APP_MODE === 'production';
  if (!isProduction) {
    try {
      const parsed = new URL(originHeader);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return true;
      }
    } catch {
      return false;
    }
  }

  try {
    const originUrl = new URL(originHeader);
    const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host');
    if (hostHeader && originUrl.host === hostHeader) {
      return true;
    }
  } catch {
    // Abaikan URL tidak valid
  }

  return false;
}

async function handler(request: NextRequest, context: Context): Promise<Response> {
  const { path } = await context.params;
  const endpoint = path.join('/');

  if (!allowed.has(`${request.method} ${endpoint}`)) {
    return jsonError('Endpoint tidak ditemukan.', 404);
  }

  if (request.method === 'POST') {
    if (!isAllowedOrigin(request.headers.get('origin'), request)) {
      return jsonError('Origin tidak diizinkan.', 403);
    }
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      return jsonError('Gunakan application/json.', 415);
    }
  }

  let body: string | undefined;
  if (request.method === 'POST') {
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
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    body = new TextDecoder().decode(bytes);
  }

  try {
    if (process.env.API_INTERNAL_URL) {
      return await forwardUpstream(request, endpoint, body);
    }
    return await handleInternal(request, endpoint, body);
  } catch {
    return jsonError('Layanan belum tersedia. Coba lagi sebentar.', 503);
  }
}

export const GET = handler;
export const POST = handler;
