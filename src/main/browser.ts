import { BrowserWindow } from 'electron';

// A persistent BrowserWindow used to load arbitrary URLs and read the rendered
// DOM back as HTML. Lets sources that are otherwise unreachable (CloudFlare
// challenge, broken cert chains, JS-built page bodies) work by letting a real
// Chromium do the heavy lifting.
//
// Configuration tradeoffs:
//   - `show: true` plus an offscreen position (-2000, -2000) — the window is
//     technically visible to Chromium (so `document.visibilityState` stays
//     "visible" and CF / anti-bot heuristics don't flag us), but the user
//     never sees it. `skipTaskbar` keeps it out of the taskbar; `focusable`
//     false prevents it from stealing input focus.
//   - `backgroundThrottling: false` — Chromium aggressively throttles JS in
//     non-foreground windows, which can stall the CF Turnstile challenge.
//   - Realistic UA + `navigator.webdriver` cleared on every navigation so
//     simple bot checks pass.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let win: BrowserWindow | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  const w = new BrowserWindow({
    show: true,
    x: -2000,
    y: -2000,
    width: 1280,
    height: 800,
    skipTaskbar: true,
    focusable: false,
    minimizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      javascript: true,
      images: true
    }
  });
  w.setMenuBarVisibility(false);
  w.webContents.setUserAgent(UA);
  w.webContents.on('dom-ready', () => {
    w.webContents
      .executeJavaScript(
        `try {
           Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
         } catch (e) {}`
      )
      .catch(() => undefined);
  });
  w.on('closed', () => {
    win = null;
  });
  win = w;
  return w;
}

export interface BrowserGetOpts {
  /** ms to wait after did-finish-load to let JS settle (CF, lazy loaders). */
  settleMs?: number;
  /** Wait until this CSS selector exists in the DOM (up to ~12 s). */
  waitForSelector?: string;
  /** Treat 4xx/5xx as success and still extract the (error) HTML. */
  acceptAnyStatus?: boolean;
  /** Scroll to bottom in steps to trigger lazy-loading. */
  scrollToLoad?: boolean;
  /** Max ms to spend scrolling (default 5000). */
  scrollMaxMs?: number;
}

export interface BrowserGetResult {
  html: string;
  finalUrl: string;
  title: string;
}

async function scrollToLoad(w: BrowserWindow, maxMs: number): Promise<void> {
  const expr = `
    new Promise((resolve) => {
      const start = Date.now();
      const max = ${maxMs};
      let lastHeight = -1;
      let stableCount = 0;
      const step = () => {
        const h = document.body.scrollHeight;
        window.scrollTo(0, h);
        if (h === lastHeight) stableCount++; else stableCount = 0;
        lastHeight = h;
        if (stableCount >= 3 || Date.now() - start >= max) {
          window.scrollTo(0, 0);
          resolve();
        } else {
          setTimeout(step, 350);
        }
      };
      step();
    });
  `;
  await w.webContents.executeJavaScript(expr).catch(() => undefined);
}

export async function browserGet(
  url: string,
  opts: BrowserGetOpts = {}
): Promise<BrowserGetResult> {
  const previous = queue;
  let releaseLock: () => void = () => undefined;
  queue = new Promise<void>((r) => (releaseLock = r));
  try {
    await previous;
  } catch {
    /* ignore */
  }

  try {
    const w = getWindow();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        w.webContents.off('did-finish-load', onLoad);
        w.webContents.off('did-fail-load', onFail);
      };
      const onLoad = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onFail = (
        _e: unknown,
        code: number,
        desc: string,
        validatedURL: string,
        isMainFrame: boolean
      ): void => {
        if (settled || !isMainFrame) return;
        // -3 ERR_ABORTED is usually a redirect; ignore.
        if (code === -3) return;
        settled = true;
        cleanup();
        if (opts.acceptAnyStatus) resolve();
        else reject(new Error(`load fail ${code}: ${desc} (${validatedURL})`));
      };
      w.webContents.on('did-finish-load', onLoad);
      w.webContents.on('did-fail-load', onFail);
      w.loadURL(url).catch((err) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (opts.acceptAnyStatus) resolve();
        else reject(err);
      });
    });

    if (opts.waitForSelector) {
      const expr = JSON.stringify(opts.waitForSelector);
      const deadline = Date.now() + 12_000;
      while (Date.now() < deadline) {
        const found = await w.webContents
          .executeJavaScript(`!!document.querySelector(${expr})`)
          .catch(() => false);
        if (found) break;
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    const settleMs = opts.settleMs ?? 1200;
    if (settleMs > 0) await new Promise((r) => setTimeout(r, settleMs));

    if (opts.scrollToLoad) {
      await scrollToLoad(w, opts.scrollMaxMs ?? 5000);
    }

    const html = (await w.webContents.executeJavaScript(
      'document.documentElement.outerHTML'
    )) as string;
    const finalUrl = w.webContents.getURL();
    const title = w.getTitle();
    return { html, finalUrl, title };
  } finally {
    releaseLock();
  }
}

export async function evalInPage<T>(expression: string): Promise<T> {
  const w = getWindow();
  return (await w.webContents.executeJavaScript(expression)) as T;
}
