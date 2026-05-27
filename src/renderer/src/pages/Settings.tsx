import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Category, Settings as SettingsT } from '@shared/types';

export default function Settings(): JSX.Element {
  const [settings, setSettings] = useState<SettingsT | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCat, setNewCat] = useState('');

  const refresh = async (): Promise<void> => {
    const [s, c] = await Promise.all([api.getSettings(), api.listCategories()]);
    setSettings(s);
    setCategories(c);
  };

  useEffect(() => {
    refresh();
  }, []);

  const patch = async (p: Partial<SettingsT>): Promise<void> => {
    const next = await api.updateSettings(p);
    setSettings(next);
    window.dispatchEvent(new CustomEvent('settings-changed', { detail: next }));
  };

  const createCat = async (): Promise<void> => {
    const name = newCat.trim();
    if (!name) return;
    await api.createCategory(name);
    setNewCat('');
    refresh();
  };

  const renameCat = async (id: string, current: string): Promise<void> => {
    const name = prompt('Rename category', current);
    if (!name || name === current) return;
    await api.renameCategory(id, name);
    refresh();
  };

  const deleteCat = async (id: string, name: string): Promise<void> => {
    if (!confirm(`Delete category "${name}"? Manga in it will become uncategorized.`)) return;
    await api.deleteCategory(id);
    refresh();
  };

  const moveCat = async (id: string, delta: number): Promise<void> => {
    const ids = categories.map((c) => c.id);
    const idx = ids.indexOf(id);
    const j = idx + delta;
    if (idx < 0 || j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    await api.reorderCategories(ids);
    refresh();
  };

  if (!settings) return <div className="loading">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      <section className="settings-section">
        <h3>Reader</h3>
        <div className="setting-row">
          <label>Default reader mode</label>
          <select
            value={settings.defaultReaderMode}
            onChange={(e) => patch({ defaultReaderMode: e.target.value as any })}
          >
            <option value="long">Long strip (vertical scroll)</option>
            <option value="paged">Paged (one image at a time)</option>
          </select>
        </div>
        <div className="setting-row">
          <label>Reading direction (paged)</label>
          <select
            value={settings.defaultDirection}
            onChange={(e) => patch({ defaultDirection: e.target.value as any })}
          >
            <option value="ltr">Left to right</option>
            <option value="rtl">Right to left</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h3>Library</h3>
        <div className="setting-row">
          <label>Default category for new entries</label>
          <select
            value={settings.defaultCategoryId ?? ''}
            onChange={(e) => patch({ defaultCategoryId: e.target.value || null })}
          >
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <label>Show read chapters in chapter lists</label>
          <input
            type="checkbox"
            checked={settings.showReadChapters}
            onChange={(e) => patch({ showReadChapters: e.target.checked })}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3>History</h3>
        <div className="setting-row">
          <label>Track reading history</label>
          <input
            type="checkbox"
            checked={settings.historyEnabled}
            onChange={(e) => patch({ historyEnabled: e.target.checked })}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3>Sources</h3>
        <div className="setting-row">
          <label>Show NSFW sources (18+) in the sidebar</label>
          <input
            type="checkbox"
            checked={settings.showNsfwSources}
            onChange={(e) => patch({ showNsfwSources: e.target.checked })}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3>Categories</h3>
        <div className="cat-list">
          {categories.length === 0 && (
            <div style={{ color: 'var(--text-dim)' }}>No categories yet.</div>
          )}
          {categories.map((c, i) => (
            <div key={c.id} className="cat-row">
              <span className="name">{c.name}</span>
              <button onClick={() => moveCat(c.id, -1)} disabled={i === 0}>↑</button>
              <button onClick={() => moveCat(c.id, +1)} disabled={i === categories.length - 1}>↓</button>
              <button onClick={() => renameCat(c.id, c.name)}>Rename</button>
              <button onClick={() => deleteCat(c.id, c.name)}>Delete</button>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input
            type="text"
            placeholder="New category…"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createCat()}
            style={{ flex: 1, maxWidth: 280 }}
          />
          <button className="primary" onClick={createCat}>
            Add
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>About</h3>
        <p style={{ color: 'var(--text-dim)' }}>
          gurureader v0.3.0 · Electron desktop manga reader · Library and downloads stored locally.
        </p>
      </section>
    </div>
  );
}
