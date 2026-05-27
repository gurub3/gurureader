import { Link } from 'react-router-dom';
import type { MangaSummary } from '@shared/types';

export default function MangaCard({
  manga,
  favorite
}: {
  manga: MangaSummary;
  favorite?: boolean;
}): JSX.Element {
  return (
    <Link
      to={`/manga/${manga.sourceId}/${encodeURIComponent(manga.sourceMangaId)}`}
      className="card-wrap"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div className="card">
        <div
          className="cover"
          style={manga.coverUrl ? { backgroundImage: `url("${manga.coverUrl}")` } : {}}
        />
        <div className="label">{manga.title}</div>
        {favorite && <div className="badge">★</div>}
      </div>
    </Link>
  );
}
