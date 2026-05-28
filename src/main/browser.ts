import { BrowserWindow } from 'electron';

// A persistent, hidden BrowserWindow used to load arbitrary URLs and read the
// rendered DOM back as HTML. Lets sources that are otherwise unreachable
// (CloudFlare challenge, broken cert chains, JS-built page bodies) work by
// letting a real Chromium do the heavy lifting.
//
// One window, serialized navigations — keeps session cookies hot across calls
// and avoids races.

let win: BrowserWindow | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Many target sites have inline scripts the page needs to execute.
      javascript: true
    }
  });
  win.on('closed', () => {
    win = null;
  });
  return win;
}

export interface BrowserGetOpts {
  /** ms to wait after did-finish-load to let JS settle (CF challenges etc.) */
  settleMs?: number;
  /** Wait until this CSS selector exists in the DOM (up to ~10s). */
  waitForSelector?: string;
  /** Treat 4xx/5xx as success and still extract the (error) HTML. */
  acceptAnyStatus?: boolean;
}

export interface BrowserGetResult {
  html: string;
  finalUrl: string;
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
        // -3 = ERR_ABORTED, usually a redirect; not fatal.
        if (code === -3) return;
        settled = true;
        cleanup();
        if (opts.acceptAnyStatus) resolve();
        else reject(new Error(`load fail ${code}: ${desc} (${validatedURL})`));
      };
      const cleanup = (): void => {
        w.webContents.off('did-finish-load', onLoad);
        w.webContents.off('did-fail-load', onFail);
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
      const deadline = Date.now() + 10_000;
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

    const html = (await w.webContents.executeJavaScript(
      'document.documentElement.outerHTML'
    )) as string;
    const finalUrl = w.webContents.getURL();
    return { html, finalUrl };
  } finally {
    releaseLock();
  }
}

// Convenience: execute arbitrary JS in the loaded page (e.g. after browserGet)
// and return the result. The expression must evaluate to a JSON-serializable
// value; runs against whatever page is currently loaded in the shared window.
export async function evalInPage<T>(expression: string): Promise<T> {
  const w = getWindow();
  return (await w.webContents.executeJavaScript(expression)) as T;
}
