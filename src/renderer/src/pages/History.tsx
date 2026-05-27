import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { HistoryEntry } from '@shared/types';

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

function groupByDay(entries: HistoryEntry[]): Array<[string, HistoryEntry[]]> {
  const groups = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const day = new Date(e.readAt).toLocaleDateString();
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(e);
  }
  return Array.from(groups);
}

export default function History(): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    api.getHistory(300).then(setEntries);
  }, []);

  const clear = async (): Promise<void> => {
    if (!confirm('Clear all reading history?')) return;
    await api.clearHistory();
    setEntries([]);
  };

  if (!entries) return <div className="loading">Loading…</div>;

  const groups = groupByDay(entries);

  return (
    <div>
      <div className="page-header">
        <h2>History</h2>
        <div className="grow" />
        {entries.length > 0 && (
          <button onClick={clear}>Clear history</button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="empty">No reading history yet.</div>
      ) : (
        groups.map(([day, list]) => (
          <div key={day} style={{ marginBottom: 24 }}>
            <h3 style={{ color: 'var(--text-dim)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>
              {day}
            </h3>
            <div className="history-list">
              {list.map((e) => (
                <Link
                  key={e.id}
                  to={`/read/${e.sourceId}/${encodeURIComponent(e.sourceMangaId)}/${encodeURIComponent(e.chapterId)}`}
                  className="history-row"
                >
                  <div
                    className="thumb"
                    style={e.mangaCover ? { backgroundImage: `url("${e.mangaCover}")` } : {}}
                  />
                  <div className="info">
                    <div className="title">{e.mangaTitle}</div>
                    <div className="ch">
                      {e.chapterNumber > 0 ? `Ch. ${e.chapterNumber} · ` : ''}
                      {e.chapterTitle}
                    </div>
                  </div>
                  <div className="when">{timeAgo(e.readAt)}</div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
