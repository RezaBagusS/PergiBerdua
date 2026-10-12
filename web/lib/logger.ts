// ----------------------------------------------------
// Structured Logger for Tracing and Debugging
// ----------------------------------------------------

export interface LogContext {
  endpoint?: string;
  method?: string;
  status?: number;
  ip?: string;
  durationMs?: number;
  userId?: string;
  [key: string]: unknown;
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack || `${err.name}: ${err.message}`;
  }
  if (typeof err === 'object' && err !== null) {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function sanitizeContext(ctx: LogContext): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    const lower = k.toLowerCase();
    if (lower.includes('secret') || lower.includes('password') || lower === 'token') {
      safe[k] = '***';
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

export const logger = {
  info(message: string, context?: LogContext) {
    const ts = new Date().toISOString();
    const ctx = context ? ` | ${JSON.stringify(sanitizeContext(context))}` : '';
    console.log(`[${ts}] [INFO] ${message}${ctx}`);
  },

  warn(message: string, context?: LogContext) {
    const ts = new Date().toISOString();
    const ctx = context ? ` | ${JSON.stringify(sanitizeContext(context))}` : '';
    console.warn(`[${ts}] [WARN] ${message}${ctx}`);
  },

  error(message: string, err?: unknown, context?: LogContext) {
    const ts = new Date().toISOString();
    const ctx = context ? ` | ${JSON.stringify(sanitizeContext(context))}` : '';
    console.error(`[${ts}] [ERROR] ${message}${ctx}`);
    if (err) {
      console.error(`[${ts}] [STACK] ${formatError(err)}`);
    }
  }
};
