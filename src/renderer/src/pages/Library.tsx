import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import MangaCard from '../components/MangaCard';
import { getLibrarySnapshot, getMainScroll, saveLibrarySnapshot } from '../navState';
import type { Category, LibraryEntry } from '@shared/types';

const UNCATEGORIZED = '__none';
const FAVORITES = '__fav';

export default function Library(): JSX.Element {
  const initialSnap = getLibrarySnapshot();
  const [items, setItems] = useState<LibraryEntry[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<string>(initialSnap?.tab ?? 'all');
  const [query, setQuery] = useState(initialSnap?.query ?? '');
  const pendingScrollTop = useRef<number | null>(initialSnap?.scrollTop ?? null);

  useEffect(() => {
    Promise.all([api.getLibrary(), api.listCategories()]).then(([lib, cats]) => {
      setItems(lib);
      setCategories(cats);
    });
  }, []);

  // Restore scroll once the list has rendered.
  useLayoutEffect(() => {
    if (pendingScrollTop.current !== null && items && items.length > 0) {
      const main = getMainScroll();
      if (main) main.scrollTop = pendingScrollTop.current;
      pendingScrollTop.current = null;
    }
  }, [items]);

  // Persist on state changes. Scroll is updated by the scroll listener below.
  useEffect(() => {
    if (!items) return;
    const main = getMainScroll();
    const existing = getLibrarySnapshot();
    saveLibrarySnapshot({
      tab,
      query,
      scrollTop: main?.scrollTop ?? existing?.scrollTop ?? 0
    });
  }, [tab, query, items]);

  // Save scroll position continuously (rAF-throttled). Capturing only at
  // unmount is unreliable because by then the next route's content has
  // replaced ours and scrollTop reads 0.
  useEffect(() => {
    if (!items) return;
    const main = getMainScroll();
    if (!main) return;
    let rafId: number | null = null;
    const onScroll = (): void => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const snap = getLibrarySnapshot();
        if (snap) saveLibrarySnapshot({ ...snap, scrollTop: main.scrollTop });
      });
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      main.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    let pool = items;
    if (tab === FAVORITES) pool = pool.filter((m) => m.favorite);
    else if (tab === UNCATEGORIZED) pool = pool.filter((m) => m.categoryIds.length === 0);
    else if (tab !== 'all') pool = pool.filter((m) => m.categoryIds.includes(tab));
    if (query) pool = pool.filter((m) => m.title.toLowerCase().includes(query.toLowerCase()));
    return [...pool].sort(
      (a, b) => (b.lastReadAt ?? b.addedAt ?? 0) - (a.lastReadAt ?? a.addedAt ?? 0)
    );
  }, [items, tab, query]);

  if (!items) return <div className="loading">Loading library…</div>;

  const counts = {
    all: items.length,
    fav: items.filter((m) => m.favorite).length,
    uncat: items.filter((m) => m.categoryIds.length === 0).length
  };

  return (
    <div>
      <div className="page-header">
        <h2>Library</h2>
        <div className="grow" />
        <input
          type="search"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 220 }}
        />
      </div>

      <div className="tabs">
        <button
          className={'tab ' + (tab === 'all' ? 'active' : '')}
          onClick={() => setTab('all')}
        >
          All <span className="count">{counts.all}</span>
        </button>
        <button
          className={'tab ' + (tab === FAVORITES ? 'active' : '')}
          onClick={() => setTab(FAVORITES)}
        >
          ★ Favorites <span className="count">{counts.fav}</span>
        </button>
        {categories.map((c) => {
          const n = items.filter((m) => m.categoryIds.includes(c.id)).length;
          return (
            <button
              key={c.id}
              className={'tab ' + (tab === c.id ? 'active' : '')}
              onClick={() => setTab(c.id)}
            >
              {c.name} <span className="count">{n}</span>
            </button>
          );
        })}
        {categories.length > 0 && counts.uncat > 0 && (
          <button
            className={'tab ' + (tab === UNCATEGORIZED ? 'active' : '')}
            onClick={() => setTab(UNCATEGORIZED)}
          >
            Uncategorized <span className="count">{counts.uncat}</span>
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          {items.length === 0
            ? 'Your library is empty. Browse a source to add titles.'
            : 'No matches.'}
        </div>
      ) : (
        <div className="grid">
          {filtered.map((m) => (
            <MangaCard key={m.key} manga={m} favorite={m.favorite} />
          ))}
        </div>
      )}
    </div>
  );
}
