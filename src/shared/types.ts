export interface SourceInfo {
  id: string;
  name: string;
  lang: string;
  baseUrl: string;
  isNsfw?: boolean;
}

export interface MangaSummary {
  sourceId: string;
  sourceMangaId: string;
  title: string;
  coverUrl?: string;
  url?: string;
}

export interface MangaDetail extends MangaSummary {
  author?: string;
  artist?: string;
  description?: string;
  status?: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
  tags?: string[];
}

export interface ChapterInfo {
  sourceChapterId: string;
  number: number;
  title: string;
  url?: string;
  uploadedAt?: number;
  scanlator?: string;
  lang?: string;
}

export interface PagedList<T> {
  items: T[];
  hasNext: boolean;
  page: number;
}

export type MangaKey = string; // `${sourceId}:${sourceMangaId}`

export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface LibraryEntry extends MangaDetail {
  key: MangaKey;
  inLibrary: boolean;
  favorite: boolean;
  categoryIds: string[];
  addedAt?: number;
  lastReadAt?: number;
}

export interface StoredChapter extends ChapterInfo {
  read: boolean;
  lastPage: number;
  downloaded: boolean;
  downloadedAt?: number;
  pageCount?: number;
}

export interface DownloadStatus {
  mangaKey: MangaKey;
  chapterId: string;
  state: 'queued' | 'downloading' | 'done' | 'error';
  progress: number; // 0..1
  pagesDone: number;
  pagesTotal: number;
  error?: string;
}

export interface ChapterPages {
  pages: string[]; // resolved URLs (for online viewing)
  isLocal: boolean;
}

export type FilterType = 'select' | 'multi';

export interface FilterOption {
  value: string;
  label: string;
}

export interface SourceFilter {
  id: string;
  label: string;
  type: FilterType;
  options: FilterOption[];
  defaultValue?: string | string[];
}

export type FilterValues = Record<string, string | string[]>;

export interface BrowseQuery {
  sourceId: string;
  kind: 'popular' | 'latest' | 'search';
  query?: string;
  page: number;
  filters?: FilterValues;
}

export type ReaderMode = 'long' | 'paged';
export type ReadingDirection = 'ltr' | 'rtl';

export interface Settings {
  defaultReaderMode: ReaderMode;
  defaultDirection: ReadingDirection;
  defaultCategoryId: string | null;
  showReadChapters: boolean;
  historyEnabled: boolean;
  showNsfwSources: boolean;
}

export interface HistoryEntry {
  id: string;
  sourceId: string;
  sourceMangaId: string;
  mangaKey: MangaKey;
  mangaTitle: string;
  mangaCover?: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  readAt: number;
  lastPage: number;
}

export interface ApiBridge {
  getAppVersion(): Promise<string>;
  listSources(): Promise<SourceInfo[]>;
  getFilters(sourceId: string): Promise<SourceFilter[]>;
  browse(q: BrowseQuery): Promise<PagedList<MangaSummary>>;
  getMangaDetail(sourceId: string, sourceMangaId: string): Promise<MangaDetail>;
  getChapters(sourceId: string, sourceMangaId: string): Promise<ChapterInfo[]>;

  getLibrary(): Promise<LibraryEntry[]>;
  getLibraryEntry(key: MangaKey): Promise<LibraryEntry | null>;
  addToLibrary(detail: MangaDetail, favorite?: boolean): Promise<LibraryEntry>;
  removeFromLibrary(key: MangaKey): Promise<void>;
  setFavorite(key: MangaKey, favorite: boolean): Promise<void>;
  setEntryCategories(key: MangaKey, categoryIds: string[]): Promise<void>;

  listCategories(): Promise<Category[]>;
  createCategory(name: string): Promise<Category>;
  renameCategory(id: string, name: string): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  reorderCategories(ids: string[]): Promise<void>;

  getStoredChapters(key: MangaKey): Promise<StoredChapter[]>;
  syncChapters(sourceId: string, sourceMangaId: string): Promise<StoredChapter[]>;
  markChapterRead(key: MangaKey, chapterId: string, read: boolean): Promise<void>;
  setLastPage(key: MangaKey, chapterId: string, page: number): Promise<void>;

  getChapterPages(sourceId: string, sourceMangaId: string, chapterId: string): Promise<ChapterPages>;
  downloadChapter(sourceId: string, sourceMangaId: string, chapterId: string): Promise<void>;
  deleteDownload(key: MangaKey, chapterId: string): Promise<void>;
  onDownloadUpdate(cb: (s: DownloadStatus) => void): () => void;

  recordHistory(entry: Omit<HistoryEntry, 'id'>): Promise<void>;
  getHistory(limit?: number): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;

  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  resolveImage(url: string): string;
}
