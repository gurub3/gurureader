import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import MangaCard from '../components/MangaCard';
import { getBrowseSnapshot, getMainScroll, saveBrowseSnapshot } from '../navState';
import type {
  BrowseQuery,
  FilterValues,
  MangaSummary,
  SourceFilter
} from '@shared/types';

type Kind = BrowseQuery['kind'];

function defaultsFor(filters: SourceFilter[]): FilterValues {
  const out: FilterValues = {};
  for (const f of filters) {
    if (f.defaultValue !== undefined) out[f.id] = f.defaultValue;
    else if (f.type === 'multi') out[f.id] = [];
    else out[f.id] = '';
  }
  return out;
}

export default function Browse(): JSX.Element {
  const { sourceId = '' } = useParams();

  const [kind, setKind] = useState<Kind>('popular');
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MangaSummary[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterDefs, setFilterDefs] = useState<SourceFilter[]>([]);
  const [filters, setFilters] = useState<FilterValues>({});
  const [appliedFilters, setAppliedFilters] = useState<FilterValues>({});
  const [showFilters, setShowFilters] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // True if the current init was a restore-from-snapshot. The fetch effect
  // checks this on its first run, skips the fetch, and resets the flag.
  const restoredRef = useRef(false);
  const pendingScrollTop = useRef<number | null>(null);

  // Initialize per source: restore snapshot if present, else load filters fresh.
  useEffect(() => {
    if (!sourceId) return;
    setInitialized(false);
    const snap = getBrowseSnapshot(sourceId);
    if (snap) {
      setKind(snap.kind);
      setQuery(snap.query);
      setActiveQuery(snap.activeQuery);
      setFilters(snap.filters);
      setAppliedFilters(snap.appliedFilters);
      setPage(snap.page);
      setItems(snap.items);
      setHasNext(snap.hasNext);
      pendingScrollTop.current = snap.scrollTop;
      restoredRef.current = true;
      api.getFilters(sourceId).then(setFilterDefs);
      setInitialized(true);
    } else {
      restoredRef.current = false;
      api.getFilters(sourceId).then((defs) => {
        setFilterDefs(defs);
        const d = defaultsFor(defs);
        setFilters(d);
        setAppliedFilters(d);
        setKind('popular');
        setQuery('');
        setActiveQuery('');
        setPage(1);
        setItems([]);
        setHasNext(false);
        setInitialized(true);
      });
    }
  }, [sourceId]);

  // Fetch listings when initialized + relevant state changes. First run after
  // a restore is skipped so we keep the cached items.
  useEffect(() => {
    if (!initialized || !sourceId) return;
    if (restoredRef.current) {
      restoredRef.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .browse({ sourceId, kind, query: activeQuery, page, filters: appliedFilters })
      .then((res) => {
        if (cancelled) return;
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
        setHasNext(res.hasNext);
      })
      .catch((e) => !cancelled && setError(e?.message ?? String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [initialized, sourceId, kind, activeQuery, page, appliedFilters]);

  // After items render, restore scroll if pending.
  useLayoutEffect(() => {
    if (pendingScrollTop.current !== null && items.length > 0) {
      const main = getMainScroll();
      if (main) main.scrollTop = pendingScrollTop.current;
      pendingScrollTop.current = null;
    }
  }, [items]);

  // Persist snapshot on state changes. Scroll is updated separately by the
  // scroll listener below, so we read it fresh here too.
  useEffect(() => {
    if (!sourceId || !initialized) return;
    const main = getMainScroll();
    const existing = getBrowseSnapshot(sourceId);
    saveBrowseSnapshot(sourceId, {
      kind,
      query,
      activeQuery,
      filters,
      appliedFilters,
      page,
      items,
      hasNext,
      scrollTop: main?.scrollTop ?? existing?.scrollTop ?? 0
    });
  }, [sourceId, initialized, kind, query, activeQuery, filters, appliedFilters, page, items, hasNext]);

  // Save scroll position continuously (rAF-throttled) so the snapshot is fresh
  // when the user navigates away. Capturing only at unmount is unreliable
  // because by the time the cleanup runs, the next route's content has already
  // replaced ours in .main and scrollTop reads 0.
  useEffect(() => {
    if (!sourceId || !initialized) return;
    const main = getMainScroll();
    if (!main) return;
    let rafId: number | null = null;
    const onScroll = (): void => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const snap = getBrowseSnapshot(sourceId);
        if (snap) saveBrowseSnapshot(sourceId, { ...snap, scrollTop: main.scrollTop });
      });
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      main.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [sourceId, initialized]);

  const startFresh = (
    next: Partial<{ kind: Kind; activeQuery: string; appliedFilters: FilterValues }>
  ): void => {
    if (next.kind !== undefined) setKind(next.kind);
    if (next.activeQuery !== undefined) setActiveQuery(next.activeQuery);
    if (next.appliedFilters !== undefined) setAppliedFilters(next.appliedFilters);
    setPage(1);
    setItems([]);
  };

  const onSearch = (e: React.FormEvent): void => {
    e.preventDefault();
    const q = query.trim();
    startFresh({ kind: q ? 'search' : 'popular', activeQuery: q });
  };

  const onApplyFilters = (): void => {
    startFresh({ appliedFilters: { ...filters } });
    setShowFilters(false);
  };

  const reset = (): void => {
    const d = defaultsFor(filterDefs);
    setFilters(d);
    startFresh({ appliedFilters: d });
  };

  const filterCount = useMemo(() => {
    let n = 0;
    for (const f of filterDefs) {
      const v = appliedFilters[f.id];
      const def = f.defaultValue;
      const cur = JSON.stringify(v ?? (f.type === 'multi' ? [] : ''));
      const dft = JSON.stringify(def ?? (f.type === 'multi' ? [] : ''));
      if (cur !== dft) n++;
    }
    return n;
  }, [filterDefs, appliedFilters]);

  return (
    <div>
      <div className="page-header">
        <h2>{sourceId}</h2>
        <div className="row">
          <button
            className={kind === 'popular' && !activeQuery ? 'primary' : 'ghost'}
            onClick={() => {
              setQuery('');
              startFresh({ kind: 'popular', activeQuery: '' });
            }}
          >
            Popular
          </button>
          <button
            className={kind === 'latest' && !activeQuery ? 'primary' : 'ghost'}
            onClick={() => {
              setQuery('');
              startFresh({ kind: 'latest', activeQuery: '' });
            }}
          >
            Latest
          </button>
        </div>
        <div className="grow" />
        <form onSubmit={onSearch} className="row">
          <input
            type="search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 240 }}
          />
          <button type="submit">Search</button>
        </form>
        {filterDefs.length > 0 && (
          <button onClick={() => setShowFilters((v) => !v)}>
            Filters{filterCount > 0 ? ` (${filterCount})` : ''}
          </button>
        )}
      </div>

      {showFilters && (
        <div className="filter-panel">
          {filterDefs.map((f) => (
            <div key={f.id} className="filter-group">
              <label>{f.label}</label>
              {f.type === 'select' && (
                <select
                  value={(filters[f.id] as string) ?? ''}
                  onChange={(e) => setFilters((p) => ({ ...p, [f.id]: e.target.value }))}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {f.type === 'multi' && (
                <div className="multi-chips">
                  {f.options.map((o) => {
                    const sel = ((filters[f.id] as string[]) ?? []).includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        className={'chip ' + (sel ? 'on' : '')}
                        onClick={() =>
                          setFilters((p) => {
                            const cur = (p[f.id] as string[]) ?? [];
                            return {
                              ...p,
                              [f.id]: sel ? cur.filter((v) => v !== o.value) : [...cur, o.value]
                            };
                          })
                        }
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <div className="filter-actions">
            <button className="primary" onClick={onApplyFilters}>
              Apply
            </button>
            <button onClick={reset}>Reset</button>
            <button className="ghost" onClick={() => setShowFilters(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {error && <div className="error">Error: {error}</div>}

      {items.length === 0 && loading && <div className="loading">Loading…</div>}
      {items.length === 0 && !loading && !error && <div className="empty">No results.</div>}

      <div className="grid">
        {items.map((m) => (
          <MangaCard key={`${m.sourceId}:${m.sourceMangaId}`} manga={m} />
        ))}
      </div>

      {hasNext && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <button onClick={() => setPage((p) => p + 1)} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
