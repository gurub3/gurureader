import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api';
import type { SourceInfo } from '@shared/types';

export default function Sidebar(): JSX.Element {
  const [sources, setSources] = useState<SourceInfo[]>([]);

  useEffect(() => {
    api.listSources().then(setSources).catch(() => setSources([]));
  }, []);

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
        {sources.map((s) => (
          <NavLink key={s.id} to={`/browse/${s.id}`}>
            {s.name}
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
