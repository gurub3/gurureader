import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api';
import type { Settings, SourceInfo } from '@shared/types';

export default function Sidebar(): JSX.Element {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [showNsfw, setShowNsfw] = useState(false);

  useEffect(() => {
    Promise.all([api.listSources(), api.getSettings()]).then(([s, settings]: [SourceInfo[], Settings]) => {
      setSources(s);
      setShowNsfw(settings.showNsfwSources);
    });
  }, []);

  // Update when Settings page emits a change event.
  useEffect(() => {
    const onChange = (e: Event): void => {
      const next = (e as CustomEvent<Settings>).detail;
      if (next) setShowNsfw(next.showNsfwSources);
    };
    window.addEventListener('settings-changed', onChange);
    return () => window.removeEventListener('settings-changed', onChange);
  }, []);

  const visible = sources.filter((s) => !s.isNsfw || showNsfw);

  return (
    <aside className="sidebar">
      <h1>GURUREADER</h1>
      <NavLink to="/" end>
        📚 Library
      </NavLink>
      <NavLink to="/history">
        🕒 History
      </NavLink>
      <div className="src-list">
        <h3>Sources</h3>
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
