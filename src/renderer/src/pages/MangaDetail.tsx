import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type {
  Category,
  DownloadStatus,
  LibraryEntry,
  MangaDetail,
  Settings,
  StoredChapter
} from '@shared/types';

function mkKey(sourceId: string, mangaId: string): string {
  return `${sourceId}:${mangaId}`;
}

function fmtDate(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString();
}

export default function MangaDetail(): JSX.Element {
  const { sourceId = '', mangaId: encId = '' } = useParams();
  const mangaId = decodeURIComponent(encId);
  const navigate = useNavigate();
  const key = mkKey(sourceId, mangaId);

  const [detail, setDetail] = useState<MangaDetail | null>(null);
  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [chapters, setChapters] = useState<StoredChapter[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Record<string, DownloadStatus>>({});
  const [showCats, setShowCats] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [d, e, cats, s] = await Promise.all([
        api.getMangaDetail(sourceId, mangaId),
        api.getLibraryEntry(key),
        api.listCategories(),
        api.getSettings()
      ]);
      setDetail(d);
      setEntry(e);
      setCategories(cats);
      setSettings(s);
      const stored = await api.getStoredChapters(key);
      if (stored.length > 0) setChapters(stored);
      const synced = await api.syncChapters(sourceId, mangaId);
      setChapters(synced);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }, [sourceId, mangaId, key]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return api.onDownloadUpdate((s) => {
      if (s.mangaKey !== key) return;
      setDownloads((prev) => ({ ...prev, [s.chapterId]: s }));
      if (s.state === 'done') {
        api.getStoredChapters(key).then(setChapters);
      }
    });
  }, [key]);

  const toggleLibrary = async (): Promise<void> => {
    if (!detail) return;
    setBusy(true);
    try {
      if (entry?.inLibrary) {
        await api.removeFromLibrary(key);
        setEntry({ ...(entry as LibraryEntry), inLibrary: false, favorite: false, categoryIds: [] });
      } else {
        const next = await api.addToLibrary(detail);
        setEntry(next);
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async (): Promise<void> => {
    if (!entry) return;
    const next = !entry.favorite;
    await api.setFavorite(key, next);
    setEntry({ ...entry, favorite: next, inLibrary: next || entry.inLibrary });
  };

  const toggleCategory = async (catId: string): Promise<void> => {
    if (!entry?.inLibrary) return;
    const has = entry.categoryIds.includes(catId);
    const next = has
      ? entry.categoryIds.filter((c) => c !== catId)
      : [...entry.categoryIds, catId];
    await api.setEntryCategories(key, next);
    setEntry({ ...entry, categoryIds: next });
  };

  const onChapterClick = (c: StoredChapter): void => {
    navigate(
      `/read/${sourceId}/${encodeURIComponent(mangaId)}/${encodeURIComponent(c.sourceChapterId)}`
    );
  };

  const startDownload = (c: StoredChapter): void => {
    api.downloadChapter(sourceId, mangaId, c.sourceChapterId);
  };

  const deleteDownload = async (c: StoredChapter): Promise<void> => {
    await api.deleteDownload(key, c.sourceChapterId);
    const stored = await api.getStoredChapters(key);
    setChapters(stored);
  };

  const toggleRead = async (c: StoredChapter): Promise<void> => {
    await api.markChapterRead(key, c.sourceChapterId, !c.read);
    setChapters((prev) =>
      prev
        ? prev.map((x) =>
            x.sourceChapterId === c.sourceChapterId ? { ...x, read: !c.read } : x
          )
        : prev
    );
  };

  const visibleChapters = useMemo(() => {
    if (!chapters) return null;
    const show = settings?.showReadChapters ?? true;
    return show ? chapters : chapters.filter((c) => !c.read);
  }, [chapters, settings]);

  const readCount = useMemo(
    () => (chapters ? chapters.filter((c) => c.read).length : 0),
    [chapters]
  );

  if (error) return <div className="error">Error: {error}</div>;
  if (!detail) return <div className="loading">Loading…</div>;

  return (
    <div>
      <button className="ghost" onClick={() => navigate(-1)}>← Back</button>

      <div className="detail" style={{ marginTop: 12 }}>
        <div
          className="cover"
          style={detail.coverUrl ? { backgroundImage: `url("${detail.coverUrl}")` } : {}}
        />
        <div className="info">
          <h2>{detail.title}</h2>
          <div className="author">
            {[detail.author, detail.artist].filter(Boolean).join(' • ') || '—'}
            {detail.status && detail.status !== 'unknown' && (
              <span className="pill" style={{ marginLeft: 8 }}>
                {detail.status}
              </span>
            )}
          </div>
          <div className="actions">
            <button className={entry?.inLibrary ? '' : 'primary'} onClick={toggleLibrary} disabled={busy}>
              {entry?.inLibrary ? '✓ In library' : '+ Add to library'}
            </button>
            <button onClick={toggleFavorite} disabled={busy || !entry?.inLibrary}>
              {entry?.favorite ? '★ Favorited' : '☆ Favorite'}
            </button>
            {entry?.inLibrary && categories.length > 0 && (
              <button onClick={() => setShowCats((v) => !v)}>
                Categories ({entry.categoryIds.length})
              </button>
            )}
          </div>
          {showCats && entry?.inLibrary && (
            <div className="cat-picker">
              {categories.map((c) => (
                <label key={c.id} className="cat-check">
                  <input
                    type="checkbox"
                    checked={entry.categoryIds.includes(c.id)}
                    onChange={() => toggleCategory(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}
          {detail.tags && detail.tags.length > 0 && (
            <div className="tags">
              {detail.tags.slice(0, 20).map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="desc">{detail.description}</div>
        </div>
      </div>

      <div className="page-header">
        <h2>
          Chapters{' '}
          {chapters && (
            <span style={{ color: 'var(--text-dim)', fontSize: 14 }}>
              ({readCount}/{chapters.length} read)
            </span>
          )}
        </h2>
        <div className="grow" />
        <button onClick={refresh}>Refresh</button>
      </div>

      {!visibleChapters ? (
        <div className="loading">Loading chapters…</div>
      ) : visibleChapters.length === 0 ? (
        <div className="empty">
          {chapters?.length ? 'All chapters read. Toggle "Show read chapters" in Settings.' : 'No chapters available.'}
        </div>
      ) : (
        <div className="chapter-list">
          {[...visibleChapters].reverse().map((c) => {
            const dl = downloads[c.sourceChapterId];
            const dling = dl && dl.state === 'downloading';
            return (
              <div key={c.sourceChapterId} className={'chapter' + (c.read ? ' read' : '')}>
                <div onClick={() => onChapterClick(c)}>
                  <div className="name">
                    {c.number > 0 ? `Ch. ${c.number}` : ''}{' '}
                    {c.title && c.title !== `Chapter ${c.number}` ? c.title : ''}
                  </div>
                  <div className="meta">
                    {fmtDate(c.uploadedAt)} {c.scanlator ? `• ${c.scanlator}` : ''}
                  </div>
                </div>
                <div>
                  {c.downloaded && <span className="state dl">Downloaded</span>}
                  {dling && (
                    <span className="state dling">
                      {dl.pagesDone}/{dl.pagesTotal}
                    </span>
                  )}
                  {dl?.state === 'error' && (
                    <span className="state" style={{ color: 'var(--danger)' }}>
                      Error
                    </span>
                  )}
                </div>
                <div className="actions">
                  {c.downloaded ? (
                    <button onClick={() => deleteDownload(c)}>Remove</button>
                  ) : (
                    <button onClick={() => startDownload(c)} disabled={!!dling}>
                      {dling ? '…' : 'Download'}
                    </button>
                  )}
                </div>
                <div className="actions">
                  <button onClick={() => toggleRead(c)}>{c.read ? 'Unread' : 'Mark read'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
