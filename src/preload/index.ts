import { contextBridge, ipcRenderer } from 'electron';
import type {
  ApiBridge,
  BrowseQuery,
  Category,
  ChapterInfo,
  ChapterPages,
  DownloadStatus,
  HistoryEntry,
  LibraryEntry,
  MangaDetail,
  MangaSummary,
  PagedList,
  Settings,
  SourceFilter,
  SourceInfo,
  StoredChapter
} from '../shared/types';

const api: ApiBridge = {
  getAppVersion: () => ipcRenderer.invoke('app:version') as Promise<string>,
  listSources: () => ipcRenderer.invoke('sources:list') as Promise<SourceInfo[]>,
  getFilters: (sourceId: string) =>
    ipcRenderer.invoke('sources:filters', sourceId) as Promise<SourceFilter[]>,

  browse: (q: BrowseQuery) =>
    ipcRenderer.invoke('browse', q) as Promise<PagedList<MangaSummary>>,
  getMangaDetail: (sourceId, mangaId) =>
    ipcRenderer.invoke('manga:detail', sourceId, mangaId) as Promise<MangaDetail>,
  getChapters: (sourceId, mangaId) =>
    ipcRenderer.invoke('manga:chapters', sourceId, mangaId) as Promise<ChapterInfo[]>,

  getLibrary: () => ipcRenderer.invoke('library:list') as Promise<LibraryEntry[]>,
  getLibraryEntry: (key) =>
    ipcRenderer.invoke('library:get', key) as Promise<LibraryEntry | null>,
  addToLibrary: (detail, favorite) =>
    ipcRenderer.invoke('library:add', detail, favorite) as Promise<LibraryEntry>,
  removeFromLibrary: (key) => ipcRenderer.invoke('library:remove', key) as Promise<void>,
  setFavorite: (key, fav) =>
    ipcRenderer.invoke('library:favorite', key, fav) as Promise<void>,
  setEntryCategories: (key, ids) =>
    ipcRenderer.invoke('library:setCategories', key, ids) as Promise<void>,

  listCategories: () => ipcRenderer.invoke('categories:list') as Promise<Category[]>,
  createCategory: (name) =>
    ipcRenderer.invoke('categories:create', name) as Promise<Category>,
  renameCategory: (id, name) =>
    ipcRenderer.invoke('categories:rename', id, name) as Promise<void>,
  deleteCategory: (id) => ipcRenderer.invoke('categories:delete', id) as Promise<void>,
  reorderCategories: (ids) =>
    ipcRenderer.invoke('categories:reorder', ids) as Promise<void>,

  getStoredChapters: (key) =>
    ipcRenderer.invoke('chapters:stored', key) as Promise<StoredChapter[]>,
  syncChapters: (sourceId, mangaId) =>
    ipcRenderer.invoke('chapters:sync', sourceId, mangaId) as Promise<StoredChapter[]>,
  markChapterRead: (key, chapterId, read) =>
    ipcRenderer.invoke('chapters:markRead', key, chapterId, read) as Promise<void>,
  setLastPage: (key, chapterId, page) =>
    ipcRenderer.invoke('chapters:setLastPage', key, chapterId, page) as Promise<void>,

  getChapterPages: (sourceId, mangaId, chapterId) =>
    ipcRenderer.invoke('pages:get', sourceId, mangaId, chapterId) as Promise<ChapterPages>,

  downloadChapter: (sourceId, mangaId, chapterId) =>
    ipcRenderer.invoke('downloads:start', sourceId, mangaId, chapterId) as Promise<void>,
  deleteDownload: (key, chapterId) => {
    const [sourceId, mangaId] = key.split(':');
    return ipcRenderer.invoke('downloads:delete', sourceId, mangaId, chapterId) as Promise<void>;
  },

  onDownloadUpdate: (cb) => {
    const listener = (_e: unknown, status: DownloadStatus): void => cb(status);
    ipcRenderer.on('download-update', listener);
    return () => ipcRenderer.removeListener('download-update', listener);
  },

  recordHistory: (entry) => ipcRenderer.invoke('history:record', entry) as Promise<void>,
  getHistory: (limit) => ipcRenderer.invoke('history:list', limit) as Promise<HistoryEntry[]>,
  clearHistory: () => ipcRenderer.invoke('history:clear') as Promise<void>,

  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Settings>,
  updateSettings: (patch) =>
    ipcRenderer.invoke('settings:update', patch) as Promise<Settings>,

  resolveImage: (url) => url
};

contextBridge.exposeInMainWorld('reader', api);
