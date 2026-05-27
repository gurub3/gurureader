import { app, BrowserWindow } from 'electron';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { DownloadStatus, MangaKey } from '@shared/types';
import { getChapter, mangaKey, updateChapter } from './database';
import { getSource } from './sources/registry';
import { fetchWithRetry } from './fetchUtil';

const UA = 'Reader/0.1 (desktop)';

function downloadsRoot(): string {
  return path.join(app.getPath('userData'), 'downloads');
}

export function chapterDir(sourceId: string, sourceMangaId: string, chapterId: string): string {
  return path.join(downloadsRoot(), sourceId, sourceMangaId, chapterId);
}

function emit(status: DownloadStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('download-update', status);
  }
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function extFromUrl(url: string): string {
  const m = url.match(/\.(jpg|jpeg|png|webp|gif)(?:\?|$)/i);
  return m ? `.${m[1].toLowerCase()}` : '.jpg';
}

async function fetchToFile(url: string, dest: string): Promise<void> {
  const res = await fetchWithRetry(url, {
    headers: { 'User-Agent': UA, Referer: 'https://mangadex.org/' }
  });
  if (!res.ok || !res.body) throw new Error(`fetch ${url} -> ${res.status}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  // node fetch returns a web ReadableStream
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(tmp));
  await fs.rename(tmp, dest);
}

export async function listDownloadedPages(
  sourceId: string,
  sourceMangaId: string,
  chapterId: string
): Promise<string[]> {
  const dir = chapterDir(sourceId, sourceMangaId, chapterId);
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((f) => /^p\d+\./i.test(f))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export async function downloadChapter(
  sourceId: string,
  sourceMangaId: string,
  chapterId: string
): Promise<void> {
  const key: MangaKey = mangaKey(sourceId, sourceMangaId);
  const source = getSource(sourceId);
  const status: DownloadStatus = {
    mangaKey: key,
    chapterId,
    state: 'queued',
    progress: 0,
    pagesDone: 0,
    pagesTotal: 0
  };
  emit(status);

  let urls: string[];
  try {
    urls = await source.fetchPageUrls(chapterId);
  } catch (e: any) {
    emit({ ...status, state: 'error', error: e?.message ?? String(e) });
    return;
  }

  status.state = 'downloading';
  status.pagesTotal = urls.length;
  emit(status);

  const dir = chapterDir(sourceId, sourceMangaId, chapterId);
  await fs.mkdir(dir, { recursive: true });
  const width = String(urls.length).length;

  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const filename = `p${pad(i + 1, width)}${extFromUrl(url)}`;
      const dest = path.join(dir, filename);
      try {
        await fs.access(dest);
      } catch {
        await fetchToFile(url, dest);
      }
      status.pagesDone = i + 1;
      status.progress = (i + 1) / urls.length;
      emit({ ...status });
    }
    await updateChapter(key, chapterId, {
      downloaded: true,
      downloadedAt: Date.now(),
      pageCount: urls.length
    });
    emit({ ...status, state: 'done', progress: 1 });
  } catch (e: any) {
    emit({ ...status, state: 'error', error: e?.message ?? String(e) });
  }
}

export async function deleteDownload(
  sourceId: string,
  sourceMangaId: string,
  chapterId: string
): Promise<void> {
  const dir = chapterDir(sourceId, sourceMangaId, chapterId);
  await fs.rm(dir, { recursive: true, force: true });
  await updateChapter(mangaKey(sourceId, sourceMangaId), chapterId, {
    downloaded: false,
    downloadedAt: undefined,
    pageCount: undefined
  });
}

export async function isChapterDownloaded(
  sourceId: string,
  sourceMangaId: string,
  chapterId: string
): Promise<boolean> {
  const ch = getChapter(mangaKey(sourceId, sourceMangaId), chapterId);
  if (!ch?.downloaded) return false;
  const pages = await listDownloadedPages(sourceId, sourceMangaId, chapterId);
  return pages.length > 0;
}
