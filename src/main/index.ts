import { app, BrowserWindow, shell, session } from 'electron';
import path from 'node:path';
import dns from 'node:dns';
import { promises as fs } from 'node:fs';
import { initDatabase } from './database';
import { registerIpc } from './ipc';

// Node 18+ defaults to "verbatim" DNS order, which can prefer broken IPv6
// routes on some Windows networks and surface as "TypeError: fetch failed".
// Prefer IPv4 for outbound fetches.
dns.setDefaultResultOrder('ipv4first');

// Some ISPs DNS-block specific hosts (notably Italy's filter on adult-content
// domains; users see ERR_NAME_NOT_RESOLVED). Route Chromium's DNS through
// Cloudflare's DNS-over-HTTPS resolver so users behind those filters can still
// reach our sources. This affects only the Chromium network stack inside the
// app, not the user's system DNS. Must be set before app is ready.
app.commandLine.appendSwitch(
  'enable-features',
  'BuiltInDnsClient,DnsOverHttps,DnsOverHttpsUpgrade'
);
app.commandLine.appendSwitch(
  'dns-over-https-templates',
  'https://cloudflare-dns.com/dns-query{?dns}'
);

// One-time migration: if the user previously ran this app under the old name
// "reader", copy their library/history/settings/downloads into the new
// gurureader userData folder so nothing is lost on rename.
async function migrateLegacyUserData(): Promise<void> {
  const appDataRoot = app.getPath('appData');
  const oldDir = path.join(appDataRoot, 'reader');
  const newDir = app.getPath('userData');
  if (oldDir === newDir) return;
  try {
    const entries = await fs.readdir(newDir);
    if (entries.length > 0) return; // already populated, do nothing
  } catch {
    // newDir doesn't exist yet — that's the migration case
  }
  try {
    await fs.access(oldDir);
  } catch {
    return; // no legacy data to migrate
  }
  try {
    await fs.cp(oldDir, newDir, { recursive: true, errorOnExist: false, force: true });
    console.log(`Migrated legacy user data from ${oldDir} to ${newDir}`);
  } catch (err) {
    console.error('Legacy user data migration failed:', err);
  }
}

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#101014',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function setupHeaders(): void {
  // Some hosts require a sensible Referer/UA before serving images.
  session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = { ...details.requestHeaders };
    const url = details.url;
    if (url.includes('mangadex.org') || url.includes('mangadex.network')) {
      headers['Referer'] = 'https://mangadex.org/';
    } else if (url.includes('comick.pictures') || url.includes('comick.fun') || url.includes('comick.io')) {
      headers['Referer'] = 'https://comick.io/';
    } else if (
      url.includes('weebcentral.com') ||
      url.includes('compsci88.com') ||
      url.includes('planeptune.us')
    ) {
      headers['Referer'] = 'https://weebcentral.com/';
    } else if (url.includes('nhentai.net')) {
      headers['Referer'] = 'https://nhentai.net/';
    } else if (url.includes('toonily.com') || url.includes('toonily.me')) {
      headers['Referer'] = 'https://toonily.com/';
    }
    cb({ requestHeaders: headers });
  });
}

app.whenReady().then(async () => {
  await migrateLegacyUserData();
  await initDatabase();
  registerIpc();
  setupHeaders();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
