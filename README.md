# gurureader

A desktop manga reader for Windows / macOS / Linux. Tachiyomi-like: pluggable sources, personal library with categories and favorites, online reading or offline downloads, reading history.

---

## 📥 Just want to use the app?

Head to the **[Releases page](../../releases)** and grab the latest:

| What you want | Download |
|---|---|
| Run on Windows (portable, no install) | `gurureader-<version>-portable-win-x64.zip` |

**To install:**
1. Download the zip.
2. Extract it anywhere on your PC.
3. Double-click **`gurureader.exe`** inside the extracted folder.

On first launch Windows SmartScreen may say *"Windows protected your PC"* — click **More info** → **Run anyway**. This happens because the app is not code-signed (Windows code-signing certificates cost ~$300/yr). The app itself is safe; the code is right here in this repo.

**Where your data lives:** `%APPDATA%\gurureader\` — library, history, settings, downloaded chapters.

**To uninstall:** delete the folder you extracted, then delete `%APPDATA%\gurureader\` if you also want to wipe your library.

---

## Features
- **Sources**: MangaDex, WeebCentral (pluggable — add more by dropping a TS file into `src/main/sources/`).
- **Library** with multi-category assignment + ★ Favorites tab.
- **Browse** any source with Popular / Latest / Search + per-source filters (genre, status, language, content rating…).
- **Read online** or **download chapters** for offline reading.
- Long-strip and paged reader modes with LTR / RTL direction.
- **Reading history** with last-page tracking.
- Navigation state preserved across back-button (scroll position, filters, loaded items).
- Robust error handling with retries, IPv4-preferred DNS, and human-readable network errors.

## Sources
- **MangaDex** — public REST API
- **WeebCentral** — HTML scraping with cheerio

Comick and MangaGo are not bundled — both moved behind CloudFlare's JS challenge, which can't be passed without a hidden browser-window solver. The plugin system makes them straightforward to add back if either provider becomes accessible again.

---

## 🔧 Developing

### Prerequisites
- Node.js 20+ (24 LTS recommended)

### Run from source
```bash
npm install
npm run dev
```

Hot-reload Electron app. First `npm install` downloads Electron (~100 MB).

### Production build (unpacked)
```bash
npm run build
```
Output goes to `out/`. Run `npm run start` to launch it.

### Package a Windows zip / installer
```bash
npm run package:win
```
Output goes to `release/`. The NSIS installer step requires **Windows Developer Mode** to be enabled (Settings → System → For developers) so that electron-builder's signing toolkit can extract its archive. Without Dev Mode, the unpacked app at `release/win-unpacked/` is still produced and can be zipped manually.

### Stack
- Electron 32 + React 18 + TypeScript + Vite
- `cheerio` for HTML scraping; everything else is `fetch` + JSON
- Library / history / settings: JSON files in `app.getPath('userData')`
- Downloads: `<userData>/downloads/<source>/<manga>/<chapter>/p001.jpg`
- Packaging: `electron-builder` (NSIS / DMG / AppImage targets configured)

### Adding a new source
1. Create `src/main/sources/<name>.ts` exporting a `Source` (see [`types.ts`](src/main/sources/types.ts)).
2. Implement: `getFilters` (optional), `fetchPopular`, `fetchLatest` (optional), `search`, `fetchDetail`, `fetchChapters`, `fetchPageUrls`.
3. Register it in [`registry.ts`](src/main/sources/registry.ts).
4. Add any required `Referer` rules to `setupHeaders()` in [`index.ts`](src/main/index.ts).

Reference implementations: [`mangadex.ts`](src/main/sources/mangadex.ts) (REST API), [`weebcentral.ts`](src/main/sources/weebcentral.ts) (HTML scraping).

---

## License
MIT
