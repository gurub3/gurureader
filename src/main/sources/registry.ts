import type { Source } from './types';
import { mangadex } from './mangadex';
import { weebcentral } from './weebcentral';
import { nhentai } from './nhentai';
import { toonily } from './toonily';

const sources: Record<string, Source> = {
  [mangadex.id]: mangadex,
  [weebcentral.id]: weebcentral,
  [nhentai.id]: nhentai,
  [toonily.id]: toonily
};

export function getSource(id: string): Source {
  const s = sources[id];
  if (!s) throw new Error(`Unknown source: ${id}`);
  return s;
}

export function listSources(): Source[] {
  return Object.values(sources);
}
