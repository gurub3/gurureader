import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  Category,
  ChapterInfo,
  HistoryEntry,
  LibraryEntry,
  MangaDetail,
  MangaKey,
  Settings,
  StoredChapter
} from '@shared/types';

interface DbShape {
  manga: Record<MangaKey, LibraryEntry>;
  chapters: Record<MangaKey, StoredChapter[]>;
  categories: Category[];
}

interface HistoryShape {
  entries: HistoryEntry[];
}

const DEFAULT_SETTINGS: Settings = {
  defaultReaderMode: 'long',
  defaultDirection: 'ltr',
  defaultCategoryId: null,
  showReadChapters: true,
  historyEnabled: true
};

function emptyDb(): DbShape {
  return { manga: {}, chapters: {}, categories: [] };
}

let db: DbShape = emptyDb();
let history: HistoryShape = { entries: [] };
let settings: Settings = { ...DEFAULT_SETTINGS };

let dbPath = '';
let historyPath = '';
let settingsPath = '';

let dbWriteQueue: Promise<void> = Promise.resolve();
let historyWriteQueue: Promise<void> = Promise.resolve();
let settingsWriteQueue: Promise<void> = Promise.resolve();

export function mangaKey(sourceId: string, sourceMangaId: string): MangaKey {
  return `${sourceId}:${sourceMangaId}`;
}

async function loadJson<T>(p: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err.code !== 'ENOENT') console.error(`load ${p} failed:`, err);
    return fallback;
  }
}

export async function initDatabase(): Promise<void> {
  const userData = app.getPath('userData');
  dbPath = path.join(userData, 'library.json');
  historyPath = path.join(userData, 'history.json');
  settingsPath = path.join(userData, 'settings.json');

  const loaded = await loadJson<Partial<DbShape>>(dbPath, {});
  db = {
    manga: loaded.manga ?? {},
    chapters: loaded.chapters ?? {},
    categories: loaded.categories ?? []
  };
  // backfill categoryIds for entries created before categories existed
  for (const e of Object.values(db.manga)) {
    if (!Array.isArray(e.categoryIds)) e.categoryIds = [];
  }

  history = await loadJson<HistoryShape>(historyPath, { entries: [] });
  const loadedSettings = await loadJson<Partial<Settings>>(settingsPath, {});
  settings = { ...DEFAULT_SETTINGS, ...loadedSettings };

  await persistAll();
}

function persistDb(): Promise<void> {
  const snap = JSON.stringify(db, null, 2);
  dbWriteQueue = dbWriteQueue.then(() => fs.writeFile(dbPath, snap, 'utf8')).catch((e) => {
    console.error('library persist failed', e);
  });
  return dbWriteQueue;
}

function persistHistory(): Promise<void> {
  const snap = JSON.stringify(history, null, 2);
  historyWriteQueue = historyWriteQueue
    .then(() => fs.writeFile(historyPath, snap, 'utf8'))
    .catch((e) => console.error('history persist failed', e));
  return historyWriteQueue;
}

function persistSettings(): Promise<void> {
  const snap = JSON.stringify(settings, null, 2);
  settingsWriteQueue = settingsWriteQueue
    .then(() => fs.writeFile(settingsPath, snap, 'utf8'))
    .catch((e) => console.error('settings persist failed', e));
  return settingsWriteQueue;
}

async function persistAll(): Promise<void> {
  await Promise.all([persistDb(), persistHistory(), persistSettings()]);
}

/* library */

export function getLibrary(): LibraryEntry[] {
  return Object.values(db.manga).filter((m) => m.inLibrary);
}

export function getEntry(key: MangaKey): LibraryEntry | null {
  return db.manga[key] ?? null;
}

export async function upsertEntry(
  detail: MangaDetail,
  opts: { inLibrary?: boolean; favorite?: boolean; categoryIds?: string[] } = {}
): Promise<LibraryEntry> {
  const key = mangaKey(detail.sourceId, detail.sourceMangaId);
  const prev = db.manga[key];
  const defaultCat = settings.defaultCategoryId ? [settings.defaultCategoryId] : [];
  const entry: LibraryEntry = {
    ...detail,
    key,
    inLibrary: opts.inLibrary ?? prev?.inLibrary ?? false,
    favorite: opts.favorite ?? prev?.favorite ?? false,
    categoryIds: opts.categoryIds ?? prev?.categoryIds ?? (opts.inLibrary ? defaultCat : []),
    addedAt: prev?.addedAt ?? (opts.inLibrary ? Date.now() : undefined),
    lastReadAt: prev?.lastReadAt
  };
  if (opts.inLibrary && !prev?.addedAt) entry.addedAt = Date.now();
  db.manga[key] = entry;
  await persistDb();
  return entry;
}

export async function removeFromLibrary(key: MangaKey): Promise<void> {
  const e = db.manga[key];
  if (e) {
    e.inLibrary = false;
    e.favorite = false;
    e.categoryIds = [];
    await persistDb();
  }
}

export async function setFavorite(key: MangaKey, favorite: boolean): Promise<void> {
  const e = db.manga[key];
  if (!e) return;
  e.favorite = favorite;
  if (favorite) e.inLibrary = true;
  await persistDb();
}

export async function setEntryCategories(key: MangaKey, categoryIds: string[]): Promise<void> {
  const e = db.manga[key];
  if (!e) return;
  e.categoryIds = [...categoryIds];
  await persistDb();
}

/* categories */

export function listCategories(): Category[] {
  return [...db.categories].sort((a, b) => a.order - b.order);
}

export async function createCategory(name: string): Promise<Category> {
  const cat: Category = {
    id: randomUUID(),
    name: name.trim() || 'Untitled',
    order: db.categories.length
  };
  db.categories.push(cat);
  await persistDb();
  return cat;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const c = db.categories.find((x) => x.id === id);
  if (c) {
    c.name = name.trim() || c.name;
    await persistDb();
  }
}

export async function deleteCategory(id: string): Promise<void> {
  db.categories = db.categories.filter((c) => c.id !== id);
  for (const m of Object.values(db.manga)) {
    m.categoryIds = m.categoryIds.filter((c) => c !== id);
  }
  if (settings.defaultCategoryId === id) {
    settings.defaultCategoryId = null;
    await persistSettings();
  }
  await persistDb();
}

export async function reorderCategories(ids: string[]): Promise<void> {
  const map = new Map(ids.map((id, i) => [id, i]));
  for (const c of db.categories) {
    const order = map.get(c.id);
    if (order !== undefined) c.order = order;
  }
  await persistDb();
}

/* chapters */

export function getChapters(key: MangaKey): StoredChapter[] {
  return db.chapters[key] ?? [];
}

export async function syncChapters(key: MangaKey, incoming: ChapterInfo[]): Promise<StoredChapter[]> {
  const existing = db.chapters[key] ?? [];
  const byId = new Map(existing.map((c) => [c.sourceChapterId, c]));
  const merged: StoredChapter[] = incoming.map((c) => {
    const prev = byId.get(c.sourceChapterId);
    return {
      ...c,
      read: prev?.read ?? false,
      lastPage: prev?.lastPage ?? 0,
      downloaded: prev?.downloaded ?? false,
      downloadedAt: prev?.downloadedAt,
      pageCount: prev?.pageCount
    };
  });
  const incomingIds = new Set(incoming.map((c) => c.sourceChapterId));
  for (const c of existing) {
    if (!incomingIds.has(c.sourceChapterId) && c.downloaded) merged.push(c);
  }
  merged.sort((a, b) => a.number - b.number);
  db.chapters[key] = merged;
  await persistDb();
  return merged;
}

export async function updateChapter(
  key: MangaKey,
  chapterId: string,
  patch: Partial<StoredChapter>
): Promise<void> {
  const list = db.chapters[key];
  if (!list) return;
  const idx = list.findIndex((c) => c.sourceChapterId === chapterId);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  const entry = db.manga[key];
  if (entry && patch.read === true) entry.lastReadAt = Date.now();
  await persistDb();
}

export function getChapter(key: MangaKey, chapterId: string): StoredChapter | undefined {
  return db.chapters[key]?.find((c) => c.sourceChapterId === chapterId);
}

/* history */

export async function recordHistory(entry: Omit<HistoryEntry, 'id'>): Promise<void> {
  if (!settings.historyEnabled) return;
  // collapse consecutive entries for the same chapter
  const last = history.entries[0];
  if (last && last.mangaKey === entry.mangaKey && last.chapterId === entry.chapterId) {
    last.lastPage = entry.lastPage;
    last.readAt = entry.readAt;
  } else {
    history.entries.unshift({ ...entry, id: randomUUID() });
  }
  // cap to 500 entries
  if (history.entries.length > 500) history.entries.length = 500;
  await persistHistory();
}

export function getHistory(limit = 200): HistoryEntry[] {
  return history.entries.slice(0, limit);
}

export async function clearHistory(): Promise<void> {
  history.entries = [];
  await persistHistory();
}

/* settings */

export function getSettings(): Settings {
  return { ...settings };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  settings = { ...settings, ...patch };
  await persistSettings();
  return { ...settings };
}
