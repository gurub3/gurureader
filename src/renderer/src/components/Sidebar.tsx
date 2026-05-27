import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api';
import type { Settings, SourceInfo } from '@shared/types';

export default function Sidebar(): JSX.Element {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [showNsfw, setShowNsfw] = useState(false);
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    Promise.all([api.listSources(), api.getSettings(), api.getAppVersion()]).then(
      ([s, settings, v]: [SourceInfo[], Settings, string]) => {
        setSources(s);
        setShowNsfw(settings.showNsfwSources);
        setVersion(v);
      }
    );
  }, []);

  // Keep in sync when Settings page toggles NSFW.
  useEffect(() => {
    const onChange = (e: Event): void => {
      const next = (e as CustomEvent<Settings>).detail;
      if (next) setShowNsfw(next.showNsfwSources);
    };
    window.addEventListener('settings-changed', onChange);
    return () => window.removeEventListener('settings-changed', onChange);
  }, []);

  const toggleNsfw = async (): Promise<void> => {
    const next = !showNsfw;
    setShowNsfw(next);
    const updated = await api.updateSettings({ showNsfwSources: next });
    window.dispatchEvent(new CustomEvent('settings-changed', { detail: updated }));
  };

  const nsfwCount = sources.filter((s) => s.isNsfw).length;
  const visible = sources.filter((s) => !s.isNsfw || showNsfw);

  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>GURUREADER</h1>
        {version && <span className="version">v{version}</span>}
      </div>
      <NavLink to="/" end>
        📚 Library
      </NavLink>
      <NavLink to="/history">
        🕒 History
      </NavLink>
      <div className="src-list">
        <div className="sources-header">
          <h3>Sources</h3>
          {nsfwCount > 0 && (
            <button
              type="button"
              className={'nsfw-toggle ' + (showNsfw ? 'on' : '')}
              onClick={toggleNsfw}
              title={showNsfw ? 'Hide 18+ sources' : 'Show 18+ sources'}
            >
              {showNsfw ? '🔞 18+ on' : '🔞 18+ off'}
            </button>
          )}
        </div>
        {visible.map((s) => (
          <NavLink key={s.id} to={`/browse/${s.id}`}>
            {s.name}
            {s.isNsfw && <span className="nsfw-pill">18+</span>}
          </NavLink>
        ))}
      </div>
      <div className="spacer" />
      <NavLink to="/settings">
        ⚙ Settings
      </NavLink>
    </aside>
  );
}
