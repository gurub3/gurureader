import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type {
  ChapterPages,
  LibraryEntry,
  MangaDetail,
  ReaderMode,
  ReadingDirection,
  Settings,
  StoredChapter
} from '@shared/types';

export default function Reader(): JSX.Element {
  const {
    sourceId = '',
    mangaId: encMangaId = '',
    chapterId: encChapterId = ''
  } = useParams();
  const mangaId = decodeURIComponent(encMangaId);
  const chapterId = decodeURIComponent(encChapterId);
  const key = `${sourceId}:${mangaId}`;
  const navigate = useNavigate();

  const [pages, setPages] = useState<ChapterPages | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ReaderMode>('long');
  const [direction, setDirection] = useState<ReadingDirection>('ltr');
  const [pageIdx, setPageIdx] = useState(0);
  const [chapters, setChapters] = useState<StoredChapter[]>([]);
  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [detail, setDetail] = useState<MangaDetail | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsLoaded = useRef(false);

  useEffect(() => {
    api.getSettings().then((s: Settings) => {
      if (!settingsLoaded.current) {
        setMode(s.defaultReaderMode);
        setDirection(s.defaultDirection);
        settingsLoaded.current = true;
      }
    });
  }, []);

  useEffect(() => {
    setPages(null);
    setError(null);
    setPageIdx(0);
    api
      .getChapterPages(sourceId, mangaId, chapterId)
      .then(setPages)
      .catch((e) => setError(e?.message ?? String(e)));
    api.getStoredChapters(key).then(setChapters);
    api.getLibraryEntry(key).then(setEntry);
    // Detail fetch as fallback for history title/cover when the manga is not
    // in the library yet.
    api.getMangaDetail(sourceId, mangaId).then(setDetail).catch(() => undefined);
  }, [sourceId, mangaId, chapterId, key]);

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [chapterId, mode]);

  const currentChapter = chapters.find((c) => c.sourceChapterId === chapterId);

  const recordHistory = useCallback(
    (lastPage: number) => {
      if (!currentChapter) return;
      const title = entry?.title ?? detail?.title;
      const cover = entry?.coverUrl ?? detail?.coverUrl;
      if (!title) return;
      api.recordHistory({
        sourceId,
        sourceMangaId: mangaId,
        mangaKey: key,
        mangaTitle: title,
        mangaCover: cover,
        chapterId,
        chapterNumber: currentChapter.number,
        chapterTitle: currentChapter.title,
        readAt: Date.now(),
        lastPage
      });
    },
    [currentChapter, entry, detail, sourceId, mangaId, key, chapterId]
  );

  const goNext = useCallback(() => {
    if (!chapters.length) return;
    const idx = chapters.findIndex((c) => c.sourceChapterId === chapterId);
    if (idx >= 0 && idx < chapters.length - 1) {
      const next = chapters[idx + 1];
      api.markChapterRead(key, chapterId, true);
      navigate(
        `/read/${sourceId}/${encodeURIComponent(mangaId)}/${encodeURIComponent(next.sourceChapterId)}`
      );
    }
  }, [chapters, chapterId, key, navigate, sourceId, mangaId]);

  const goPrev = useCallback(() => {
    if (!chapters.length) return;
    const idx = chapters.findIndex((c) => c.sourceChapterId === chapterId);
    if (idx > 0) {
      const prev = chapters[idx - 1];
      navigate(
        `/read/${sourceId}/${encodeURIComponent(mangaId)}/${encodeURIComponent(prev.sourceChapterId)}`
      );
    }
  }, [chapters, chapterId, navigate, sourceId, mangaId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') navigate(-1);
      if (mode === 'paged' && pages) {
        const fwd =
          (direction === 'ltr' && e.key === 'ArrowRight') ||
          (direction === 'rtl' && e.key === 'ArrowLeft') ||
          e.key === ' ';
        const back =
          (direction === 'ltr' && e.key === 'ArrowLeft') ||
          (direction === 'rtl' && e.key === 'ArrowRight');
        if (fwd) {
          if (pageIdx < pages.pages.length - 1) {
            setPageIdx((p) => {
              const np = p + 1;
              recordHistory(np);
              return np;
            });
          } else goNext();
        }
        if (back) {
          if (pageIdx > 0) setPageIdx((p) => p - 1);
          else goPrev();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, pageIdx, pages, goNext, goPrev, navigate, direction, recordHistory]);

  useEffect(() => {
    if (mode !== 'long' || !pages) return;
    const el = containerRef.current;
    if (!el) return;
    let lastSeen = 0;
    let throttle: ReturnType<typeof setTimeout> | null = null;
    const onScroll = (): void => {
      const ratio =
        el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0;
      const approx = Math.floor(ratio * pages.pages.length);
      if (approx !== lastSeen) {
        lastSeen = approx;
        api.setLastPage(key, chapterId, approx);
        if (throttle) clearTimeout(throttle);
        throttle = setTimeout(() => recordHistory(approx), 800);
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
        api.markChapterRead(key, chapterId, true);
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (throttle) clearTimeout(throttle);
    };
  }, [mode, pages, key, chapterId, recordHistory]);

  // record initial open as soon as we have what we need
  useEffect(() => {
    if (pages && currentChapter && (entry || detail)) {
      recordHistory(currentChapter.lastPage ?? 0);
    }
  }, [pages, entry, detail, currentChapter, recordHistory]);

  return (
    <div className="reader">
      <div className="topbar">
        <button onClick={() => navigate(-1)}>✕</button>
        <div className="title">
          {currentChapter
            ? `${currentChapter.number > 0 ? 'Ch. ' + currentChapter.number : ''} ${currentChapter.title ?? ''}`.trim()
            : 'Loading…'}
        </div>
        <div className="grow" />
        <div className="row">
          <button
            className={mode === 'long' ? 'primary' : ''}
            onClick={() => setMode('long')}
            title="Long strip"
          >
            ↕ Long
          </button>
          <button
            className={mode === 'paged' ? 'primary' : ''}
            onClick={() => setMode('paged')}
            title="Paged"
          >
            ⇄ Paged
          </button>
          {mode === 'paged' && (
            <button
              onClick={() => setDirection((d) => (d === 'ltr' ? 'rtl' : 'ltr'))}
              title="Toggle direction"
            >
              {direction === 'ltr' ? '→' : '←'}
            </button>
          )}
        </div>
        {pages && !pages.isLocal && (
          <span className="pill" title="Streaming from source">
            online
          </span>
        )}
        {pages?.isLocal && (
          <span className="pill" style={{ background: 'var(--ok)', color: '#06150e' }}>
            offline
          </span>
        )}
      </div>

      {error && <div className="error">Error: {error}</div>}
      {!pages && !error && <div className="loading">Loading pages…</div>}

      {pages && (
        <div ref={containerRef} className={'pages ' + (mode === 'paged' ? 'paged' : '')}>
          {mode === 'long'
            ? pages.pages.map((src, i) => (
                <img key={i} src={src} alt={`page ${i + 1}`} loading="lazy" />
              ))
            : pages.pages[pageIdx] && (
                <img key={pageIdx} src={pages.pages[pageIdx]} alt={`page ${pageIdx + 1}`} />
              )}
        </div>
      )}

      {pages && (
        <div className="bottombar">
          <button onClick={goPrev}>← Prev chapter</button>
          {mode === 'paged' && (
            <span style={{ color: 'var(--text-dim)' }}>
              {pageIdx + 1} / {pages.pages.length}
            </span>
          )}
          <button onClick={goNext}>Next chapter →</button>
        </div>
      )}
    </div>
  );
}
