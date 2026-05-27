// Network helpers shared across sources. Node's built-in `fetch` (undici)
// reports every transport failure as the unhelpful `TypeError: fetch failed`;
// the real cause is on `error.cause`. We surface it, add a per-request timeout,
// and retry on transient errors with exponential backoff.

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;

interface RetryOpts {
  retries?: number;
  timeoutMs?: number;
}

function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export class NetworkError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
  }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOpts = {}
): Promise<Response> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  }

  // Unwrap undici's TypeError to the underlying network error.
  const e = lastError as { name?: string; cause?: { code?: string; message?: string }; message?: string } | undefined;
  const cause = e?.cause;
  const code = cause?.code;
  const detail = cause?.message ?? e?.message ?? String(lastError);
  const host = shortHost(url);
  let hint = '';
  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      hint = ' — DNS lookup failed. Check your internet connection.';
      break;
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
      hint = ' — connection timed out. The site may be blocked on your network or unreachable.';
      break;
    case 'ECONNREFUSED':
      hint = ' — connection refused. The site may be down.';
      break;
    case 'ECONNRESET':
      hint = ' — connection reset. The site may be blocking this client.';
      break;
    case 'CERT_HAS_EXPIRED':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      hint = ' — TLS certificate problem. Your system clock or antivirus may be interfering.';
      break;
  }
  if (e?.name === 'AbortError' && !code) {
    hint = ` — request to ${host} timed out after ${Math.round(timeoutMs / 1000)}s.`;
  }
  throw new NetworkError(`Network error reaching ${host}${hint} [${code ?? 'unknown'}: ${detail}]`, code);
}
