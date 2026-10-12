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
  'POST invites/reject',
  'POST invites/cancel',
  'POST places/save',
  'POST places/action',
  'POST admin/login',
  'POST admin/logout',
  'GET admin/stats',
  'GET admin/users',
  'GET admin/rooms',
  'GET admin/jobs',
  'POST admin/jobs/trigger'
]);

type Context = { params: Promise<{ path: string[] }> };

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

function logApi(
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  meta?: Record<string, unknown>,
  err?: unknown
) {
  const ts = new Date().toISOString();
  let metaStr = '';
  if (meta) {
    const cleanMeta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (['password', 'token', 'secret', 'code', 'cookie'].includes(k.toLowerCase())) {
        cleanMeta[k] = '***';
      } else {
        cleanMeta[k] = v;
      }
    }
    metaStr = ` | ${JSON.stringify(cleanMeta)}`;
  }

  if (level === 'ERROR') {
    console.error(`[${ts}] [API ERROR] ${message}${metaStr}`);
    if (err instanceof Error && err.stack) {
      console.error(`[${ts}] [STACK] ${err.stack}`);
    }
  } else if (level === 'WARN') {
    console.warn(`[${ts}] [API WARN] ${message}${metaStr}`);
  } else {
    console.log(`[${ts}] [API INFO] ${message}${metaStr}`);
  }
}

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
  const startTime = Date.now();
  const { ApiError } = await import('../../../lib/domain');
  const server = await import('../../../lib/server');
  const admin = await import('../../../lib/admin');

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
      logApi('WARN', `Format JSON tidak valid pada ${request.method} /api/${endpoint}`, { ip: remoteIp });
      return jsonError('Format permintaan tidak valid.', 400);
    }
  }

  const routeKey = `${request.method} ${endpoint}`;

  try {
    let result: Response;
    switch (routeKey) {
      case 'GET health':
        result = Response.json(await server.handleHealth(), { headers: responseHeaders });
        break;

      case 'GET config':
        result = Response.json(server.handleConfig(), { headers: responseHeaders });
        break;

      case 'GET me':
        result = Response.json(await server.handleMe(cookieHeader), { headers: responseHeaders });
        break;

      case 'GET room': {
        const id = request.nextUrl.searchParams.get('id');
        result = Response.json(await server.handleRoom(cookieHeader, id), { headers: responseHeaders });
        break;
      }

      case 'GET cron/reminders':
      case 'POST cron/reminders':
        result = Response.json(await server.handleCronReminders(), { headers: responseHeaders });
        break;

      case 'POST auth/request':
        result = Response.json(await server.handleAuthRequest(parsedBody, remoteIp), {
          headers: responseHeaders
        });
        break;

      case 'POST auth/verify': {
        const { user, setCookie } = await server.handleAuthVerify(parsedBody, remoteIp);
        const headers = new Headers(responseHeaders);
        headers.set('Set-Cookie', setCookie);
        result = Response.json({ user }, { headers });
        break;
      }

      case 'POST auth/logout': {
        const { ok, setCookie } = await server.handleAuthLogout(cookieHeader);
        const headers = new Headers(responseHeaders);
        headers.set('Set-Cookie', setCookie);
        result = Response.json({ ok }, { headers });
        break;
      }

      case 'POST preferences':
        result = Response.json(await server.handlePreferences(cookieHeader, parsedBody), {
          headers: responseHeaders
        });
        break;

      case 'POST rooms/create':
        result = Response.json(await server.handleRoomCreate(cookieHeader, parsedBody), {
          headers: responseHeaders
        });
        break;

      case 'POST rooms/profile':
        result = Response.json(await server.handleRoomProfile(cookieHeader, parsedBody), {
          headers: responseHeaders
        });
        break;

      case 'POST rooms/leave':
        result = Response.json(await server.handleRoomLeave(cookieHeader, parsedBody), {
          headers: responseHeaders
        });
        break;

      case 'POST invites/create':
        result = Response.json(await server.handleInviteCreate(cookieHeader, parsedBody), {
          headers: responseHeaders
        });
        break;

      case 'POST invites/accept':
        result = Response.json(await server.handleInviteAccept(cookieHeader, parsedBody), {
          headers: responseHeaders
        });
        break;

      case 'POST invites/reject':
        result = Response.json(await server.handleInviteReject(cookieHeader, parsedBody), {
          headers: responseHeaders
        });
        break;

      case 'POST invites/cancel':
        result = Response.json(await server.handleInviteCancel(cookieHeader, parsedBody), {
          headers: responseHeaders
        });
        break;

      case 'POST places/save':
        result = Response.json(await server.handlePlaceSave(cookieHeader, parsedBody), {
          headers: responseHeaders
        });
        break;

      case 'POST places/action':
        result = Response.json(await server.handlePlaceAction(cookieHeader, parsedBody), {
          headers: responseHeaders
        });
        break;

      case 'POST admin/login': {
        const { ok, setCookie } = await admin.handleAdminLogin(String(parsedBody.secret || ''));
        const headers = new Headers(responseHeaders);
        headers.set('Set-Cookie', setCookie);
        result = Response.json({ ok }, { headers });
        break;
      }

      case 'POST admin/logout': {
        const { ok, setCookie } = admin.handleAdminLogout();
        const headers = new Headers(responseHeaders);
        headers.set('Set-Cookie', setCookie);
        result = Response.json({ ok }, { headers });
        break;
      }

      case 'GET admin/stats': {
        admin.verifyAdmin(cookieHeader);
        result = Response.json(await admin.getAdminStats(), { headers: responseHeaders });
        break;
      }

      case 'GET admin/users': {
        admin.verifyAdmin(cookieHeader);
        const q = request.nextUrl.searchParams.get('q') || '';
        result = Response.json(await admin.getAdminUsers(q), { headers: responseHeaders });
        break;
      }

      case 'GET admin/rooms': {
        admin.verifyAdmin(cookieHeader);
        const q = request.nextUrl.searchParams.get('q') || '';
        result = Response.json(await admin.getAdminRooms(q), { headers: responseHeaders });
        break;
      }

      case 'GET admin/jobs': {
        admin.verifyAdmin(cookieHeader);
        result = Response.json(await admin.getAdminJobs(), { headers: responseHeaders });
        break;
      }

      case 'POST admin/jobs/trigger': {
        admin.verifyAdmin(cookieHeader);
        result = Response.json(await admin.triggerAdminWorker(), { headers: responseHeaders });
        break;
      }

      default:
        logApi('WARN', `Endpoint tidak ditemukan: ${routeKey}`, { ip: remoteIp });
        return jsonError('Endpoint tidak ditemukan.', 404);
    }

    logApi('INFO', `${routeKey} -> ${result.status} OK (${Date.now() - startTime}ms)`, {
      ip: remoteIp,
      durationMs: Date.now() - startTime
    });
    return result;
  } catch (err: unknown) {
    const isApiError = err instanceof ApiError;
    const e = err as { status?: number; code?: string; message?: string; name?: string };
    const status = isApiError && typeof e.status === 'number' ? e.status : e.code === '23505' ? 409 : 500;
    const message =
      status === 500
        ? 'Terjadi masalah server. Coba lagi.'
        : isApiError && typeof e.message === 'string'
        ? e.message
        : 'Data sudah digunakan atau ruang berubah. Muat ulang dan coba lagi.';

    if (status === 500) {
      logApi(
        'ERROR',
        `500 Server Error pada ${routeKey} (${Date.now() - startTime}ms): ${e.message || e.code || 'Unknown error'}`,
        {
          routeKey,
          ip: remoteIp,
          durationMs: Date.now() - startTime,
          code: e.code,
          body: parsedBody
        },
        err
      );
    } else {
      logApi(
        'WARN',
        `${status} Client Error pada ${routeKey} (${Date.now() - startTime}ms): ${message}`,
        {
          routeKey,
          status,
          ip: remoteIp,
          durationMs: Date.now() - startTime
        }
      );
    }
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
  const remoteIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  if (!allowed.has(`${request.method} ${endpoint}`)) {
    logApi('WARN', `404 Not Found: ${request.method} /api/${endpoint}`, { ip: remoteIp });
    return jsonError('Endpoint tidak ditemukan.', 404);
  }

  if (request.method === 'POST') {
    const originHeader = request.headers.get('origin');
    if (!isAllowedOrigin(originHeader, request)) {
      logApi('WARN', `403 Origin Ditolak: "${originHeader}" pada ${request.method} /api/${endpoint}`, {
        method: request.method,
        endpoint,
        origin: originHeader,
        ip: remoteIp
      });
      return jsonError('Origin tidak diizinkan.', 403);
    }
    const contentType = request.headers.get('content-type');
    if (!contentType?.startsWith('application/json')) {
      logApi('WARN', `415 Content-Type Invalid: "${contentType}" pada ${request.method} /api/${endpoint}`, {
        method: request.method,
        endpoint,
        contentType,
        ip: remoteIp
      });
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
          logApi('WARN', `413 Payload Terlalu Besar (${size} bytes) pada ${request.method} /api/${endpoint}`, {
            method: request.method,
            endpoint,
            ip: remoteIp,
            size
          });
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
  } catch (err) {
    logApi('ERROR', `503 Layanan gagal merespons pada ${request.method} /api/${endpoint}`, { ip: remoteIp }, err);
    return jsonError('Layanan belum tersedia. Coba lagi sebentar.', 503);
  }
}

export const GET = handler;
export const POST = handler;

