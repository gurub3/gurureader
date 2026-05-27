import { BrowserWindow } from 'electron';

// Per-host CF challenge solver. Loads the URL in a hidden BrowserWindow long
// enough for Cloudflare's JS challenge to set the clearance cookie, then closes.
// Subsequent requests through Electron's session reuse the cookie.

const solved = new Set<string>();
const solving = new Map<string, Promise<void>>();
const CHALLENGE_TIMEOUT_MS = 20000;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function isChallenge(body: string): boolean {
  if (!body) return false;
  return /Just a moment\.\.\.|cf-mitigated|cf_chl_opt|challenges\.cloudflare\.com/i.test(body);
}

export async function solveChallenge(url: string): Promise<void> {
  const host = hostOf(url);
  if (solved.has(host)) return;
  const existing = solving.get(host);
  if (existing) return existing;

  const promise = (async () => {
    const win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    });
    try {
      const giveUp = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('CF challenge timeout for ' + host)), CHALLENGE_TIMEOUT_MS)
      );
      const wait = (async () => {
        await win.loadURL(url).catch(() => undefined);
        for (let i = 0; i < 40; i++) {
          const title = win.getTitle();
          if (title && !/just a moment/i.test(title) && !/^attention required/i.test(title)) return;
          await new Promise((r) => setTimeout(r, 400));
        }
      })();
      await Promise.race([wait, giveUp]);
      solved.add(host);
    } finally {
      win.destroy();
    }
  })();

  solving.set(host, promise);
  try {
    await promise;
  } finally {
    solving.delete(host);
  }
}

// Fetch via Electron's net (uses session cookies + Chromium TLS/cert handling);
// if a CloudFlare challenge is returned, solve it and retry once.
export async function cfFetch(url: string, init?: RequestInit): Promise<Response> {
  const { net } = await import('electron');
  const doFetch = (): Promise<Response> => net.fetch(url, init as any);
  let res = await doFetch();
  if (res.status === 403 || res.status === 503) {
    const sample = await res.clone().text();
    if (isChallenge(sample)) {
      await solveChallenge(url);
      res = await doFetch();
    }
  }
  return res;
}

// Render a URL in a hidden BrowserWindow and return image URLs visible in the
// DOM. For sites that compose image URLs client-side from obfuscated data.
export async function getRenderedImageUrls(
  url: string,
  opts: { waitMs?: number; minCount?: number; selector?: string } = {}
): Promise<string[]> {
  const waitMs = opts.waitMs ?? 8000;
  const minCount = opts.minCount ?? 2;
  const selector = opts.selector ?? 'img';
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  try {
    await win.loadURL(url).catch(() => undefined);
    const extract = `Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .map(i => i.currentSrc || i.src || i.getAttribute('data-src') || '')
      .filter(s => /^https?:\\/\\//.test(s) && /\\.(jpe?g|png|webp|gif)(\\?|#|$)/i.test(s));`;
    const start = Date.now();
    while (Date.now() - start < waitMs) {
      const found = await win.webContents.executeJavaScript(extract).catch(() => []);
      if (Array.isArray(found) && found.length >= minCount) {
        return Array.from(new Set(found as string[]));
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    const final = await win.webContents.executeJavaScript(extract).catch(() => []);
    return Array.isArray(final) ? Array.from(new Set(final as string[])) : [];
  } finally {
    win.destroy();
  }
}
