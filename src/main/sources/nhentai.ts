import type {
  ChapterInfo,
  FilterValues,
  MangaDetail,
  MangaSummary,
  PagedList,
  SourceFilter
} from '@shared/types';
import type { Source } from './types';
import { cfFetch } from '../cfbypass';

// nhentai is gallery-based (one "chapter" = the whole gallery). Their public
// JSON API serves everything we need. Goes through Electron's net so the
// system cert store is used (some Node versions have CA chain issues).
const API = 'https://nhentai.net/api';
const SITE = 'https://nhentai.net';
const IMG_BASE = 'https://i.nhentai.net/galleries';
const THUMB_BASE = 'https://t.nhentai.net/galleries';

type NhMediaType = 'j' | 'p' | 'g' | 'w';

interface NhPage {
  t: NhMediaType;
  w: number;
  h: number;
}

interface NhGallery {
  id: number;
  media_id: string;
  title: { english?: string; japanese?: string; pretty?: string };
  images: {
    pages: NhPage[];
    cover: NhPage;
    thumbnail: NhPage;
  };
  scanlator?: string;
  upload_date: number; // unix seconds
  tags: Array<{ id: number; type: string; name: string; url: string; count: number }>;
  num_pages: number;
  num_favorites: number;
}

interface NhSearchResp {
  result: NhGallery[];
  num_pages: number;
  per_page: number;
}

function extOf(t: NhMediaType): string {
  switch (t) {
    case 'p': return 'png';
    case 'g': return 'gif';
    case 'w': return 'webp';
    case 'j':
    default: return 'jpg';
  }
}

function pickTitle(t: NhGallery['title']): string {
  return t.english ?? t.pretty ?? t.japanese ?? 'Untitled';
}

function coverUrlOf(g: NhGallery): string {
  return `${THUMB_BASE}/${g.media_id}/cover.${extOf(g.images.cover.t)}`;
}

function toSummary(g: NhGallery): MangaSummary {
  return {
    sourceId: 'nhentai',
    sourceMangaId: String(g.id),
    title: pickTitle(g.title),
    coverUrl: coverUrlOf(g),
    url: `${SITE}/g/${g.id}/`
  };
}

async function nhJson<T>(url: string): Promise<T> {
  const res = await cfFetch(url, {
    headers: {
      Accept: 'application/json,*/*',
      Referer: SITE + '/'
    }
  });
  if (!res.ok) throw new Error(`nhentai ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

const SORT_OPTS = [
  { value: 'popular', label: 'All time popular' },
  { value: 'popular-week', label: 'Popular this week' },
  { value: 'popular-today', label: 'Popular today' },
  { value: 'date', label: 'Newest' }
];

export const nhentai: Source = {
  id: 'nhentai',
  name: 'nhentai',
  lang: 'en',
  baseUrl: SITE,
  isNsfw: true,

  getFilters(): SourceFilter[] {
    return [
      {
        id: 'sort',
        label: 'Sort by',
        type: 'select',
        options: SORT_OPTS,
        defaultValue: 'popular'
      }
    ];
  },

  async fetchPopular(page, filters) {
    const sort = (filters?.sort as string) || 'popular';
    // The search endpoint with empty query supports the sort parameter.
    return this.search('', page, { sort });
  },

  async fetchLatest(page) {
    return this.search('', page, { sort: 'date' });
  },

  async search(query, page, filters) {
    const sort = (filters?.sort as string) || 'popular';
    const params = new URLSearchParams({ query: query || '*', page: String(page), sort });
    const data = await nhJson<NhSearchResp>(`${API}/galleries/search?${params.toString()}`);
    return {
      items: data.result.map(toSummary),
      page,
      hasNext: page < data.num_pages
    };
  },

  async fetchDetail(id) {
    const g = await nhJson<NhGallery>(`${API}/gallery/${id}`);
    return {
      sourceId: 'nhentai',
      sourceMangaId: id,
      title: pickTitle(g.title),
      coverUrl: coverUrlOf(g),
      url: `${SITE}/g/${g.id}/`,
      author: g.tags.filter((t) => t.type === 'artist').map((t) => t.name).join(', ') || undefined,
      description: `${g.num_pages} pages · ${g.num_favorites.toLocaleString()} favorites`,
      status: 'completed',
      tags: g.tags
        .filter((t) => t.type !== 'language' || t.name !== 'translated')
        .map((t) => t.name)
    };
  },

  async fetchChapters(id) {
    const g = await nhJson<NhGallery>(`${API}/gallery/${id}`);
    // nhentai galleries are single-volume; expose as one synthetic chapter.
    const ch: ChapterInfo = {
      sourceChapterId: String(g.id),
      number: 1,
      title: `${g.num_pages} pages`,
      url: `${SITE}/g/${g.id}/`,
      uploadedAt: g.upload_date * 1000,
      scanlator: g.scanlator || undefined,
      lang: 'en'
    };
    return [ch];
  },

  async fetchPageUrls(chapterId) {
    const g = await nhJson<NhGallery>(`${API}/gallery/${chapterId}`);
    return g.images.pages.map(
      (p, i) => `${IMG_BASE}/${g.media_id}/${i + 1}.${extOf(p.t)}`
    );
  }
};
