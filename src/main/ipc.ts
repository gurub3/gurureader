import { ipcMain } from 'electron';
import {
  clearHistory,
  createCategory,
  deleteCategory,
  getChapters,
  getEntry,
  getHistory,
  getLibrary,
  getSettings,
  listCategories,
  mangaKey,
  recordHistory,
  removeFromLibrary,
  renameCategory,
  reorderCategories,
  setEntryCategories,
  setFavorite,
  syncChapters,
  updateChapter,
  updateSettings,
  upsertEntry
} from './database';
import {
  deleteDownload,
  downloadChapter,
  isChapterDownloaded,
  listDownloadedPages
} from './downloads';
import { getSource, listSources } from './sources/registry';
import { pathToFileURL } from 'node:url';
import type {
  BrowseQuery,
  ChapterPages,
  HistoryEntry,
  MangaDetail,
  Settings
} from '@shared/types';

export function registerIpc(): void {
  ipcMain.handle('sources:list', () =>
    listSources().map((s) => ({ id: s.id, name: s.name, lang: s.lang, baseUrl: s.baseUrl }))
  );

  ipcMain.handle('sources:filters', (_e, sourceId: string) => {
    const s = getSource(sourceId);
    return s.getFilters ? s.getFilters() : [];
  });

  ipcMain.handle('browse', async (_e, q: BrowseQuery) => {
    const src = getSource(q.sourceId);
    if (q.kind === 'popular') return src.fetchPopular(q.page, q.filters);
    if (q.kind === 'latest')
      return src.fetchLatest ? src.fetchLatest(q.page, q.filters) : src.fetchPopular(q.page, q.filters);
    return src.search(q.query ?? '', q.page, q.filters);
  });

  ipcMain.handle('manga:detail', async (_e, sourceId: string, mangaId: string) => {
    return getSource(sourceId).fetchDetail(mangaId);
  });

  ipcMain.handle('manga:chapters', async (_e, sourceId: string, mangaId: string) => {
    return getSource(sourceId).fetchChapters(mangaId);
  });

  // library
  ipcMain.handle('library:list', () => getLibrary());
  ipcMain.handle('library:get', (_e, key: string) => getEntry(key));
  ipcMain.handle('library:add', (_e, detail: MangaDetail, favorite?: boolean) =>
    upsertEntry(detail, { inLibrary: true, favorite })
  );
  ipcMain.handle('library:remove', (_e, key: string) => removeFromLibrary(key));
  ipcMain.handle('library:favorite', (_e, key: string, fav: boolean) => setFavorite(key, fav));
  ipcMain.handle('library:setCategories', (_e, key: string, ids: string[]) =>
    setEntryCategories(key, ids)
  );

  // categories
  ipcMain.handle('categories:list', () => listCategories());
  ipcMain.handle('categories:create', (_e, name: string) => createCategory(name));
  ipcMain.handle('categories:rename', (_e, id: string, name: string) => renameCategory(id, name));
  ipcMain.handle('categories:delete', (_e, id: string) => deleteCategory(id));
  ipcMain.handle('categories:reorder', (_e, ids: string[]) => reorderCategories(ids));

  // chapters
  ipcMain.handle('chapters:stored', (_e, key: string) => getChapters(key));
  ipcMain.handle('chapters:sync', async (_e, sourceId: string, mangaId: string) => {
    const incoming = await getSource(sourceId).fetchChapters(mangaId);
    return syncChapters(mangaKey(sourceId, mangaId), incoming);
  });
  ipcMain.handle('chapters:markRead', (_e, key: string, chapterId: string, read: boolean) =>
    updateChapter(key, chapterId, { read })
  );
  ipcMain.handle('chapters:setLastPage', (_e, key: string, chapterId: string, page: number) =>
    updateChapter(key, chapterId, { lastPage: page })
  );

  // pages / downloads
  ipcMain.handle(
    'pages:get',
    async (_e, sourceId: string, mangaId: string, chapterId: string): Promise<ChapterPages> => {
      const local = await isChapterDownloaded(sourceId, mangaId, chapterId);
      if (local) {
        const files = await listDownloadedPages(sourceId, mangaId, chapterId);
        return {
          pages: files.map((p) => pathToFileURL(p).href),
          isLocal: true
        };
      }
      const urls = await getSource(sourceId).fetchPageUrls(chapterId);
      return { pages: urls, isLocal: false };
    }
  );

  ipcMain.handle('downloads:start', (_e, sourceId: string, mangaId: string, chapterId: string) =>
    downloadChapter(sourceId, mangaId, chapterId)
  );
  ipcMain.handle('downloads:delete', (_e, sourceId: string, mangaId: string, chapterId: string) =>
    deleteDownload(sourceId, mangaId, chapterId)
  );

  // history
  ipcMain.handle('history:record', (_e, entry: Omit<HistoryEntry, 'id'>) => recordHistory(entry));
  ipcMain.handle('history:list', (_e, limit?: number) => getHistory(limit));
  ipcMain.handle('history:clear', () => clearHistory());

  // settings
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => updateSettings(patch));
}
