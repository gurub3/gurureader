import type {
  ChapterInfo,
  FilterValues,
  MangaDetail,
  MangaSummary,
  PagedList,
  SourceFilter
} from '@shared/types';
import type { Source } from './types';
import { fetchWithRetry } from '../fetchUtil';

const API = 'https://api.mangadex.org';
const UPLOADS = 'https://uploads.mangadex.org';
const PAGE_SIZE = 24;
const UA = 'Reader/0.1 (desktop)';

interface MdRel { id: string; type: string; attributes?: any }
interface MdManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    description: Record<string, string>;
    status: string;
    tags: Array<{ attributes: { name: Record<string, string> } }>;
  };
  relationships: MdRel[];
}

interface MdChapter {
  id: string;
  attributes: {
    chapter: string | null;
    title: string | null;
    translatedLanguage: string;
    publishAt: string;
    pages: number;
    externalUrl?: string | null;
  };
  relationships: MdRel[];
}

function pickTitle(t: Record<string, string> | undefined): string {
  if (!t) return 'Untitled';
  return t.en ?? t['ja-ro'] ?? t['ja'] ?? t['ko-ro'] ?? t['zh-ro'] ?? Object.values(t)[0] ?? 'Untitled';
}

function pickDesc(d: Record<string, string> | undefined): string {
  if (!d) return '';
  return d.en ?? Object.values(d)[0] ?? '';
}

function findRel(rels: MdRel[], type: string): MdRel | undefined {
  return rels.find((r) => r.type === type);
}

function buildCoverUrl(mangaId: string, rels: MdRel[]): string | undefined {
  const cover = findRel(rels, 'cover_art');
  const filename = cover?.attributes?.fileName;
  if (!filename) return undefined;
  return `${UPLOADS}/covers/${mangaId}/${filename}.512.jpg`;
}

function toSummary(m: MdManga): MangaSummary {
  return {
    sourceId: 'mangadex',
    sourceMangaId: m.id,
    title: pickTitle(m.attributes.title),
    coverUrl: buildCoverUrl(m.id, m.relationships),
    url: `https://mangadex.org/title/${m.id}`
  };
}

function toDetail(m: MdManga): MangaDetail {
  const author = findRel(m.relationships, 'author')?.attributes?.name as string | undefined;
  const artist = findRel(m.relationships, 'artist')?.attributes?.name as string | undefined;
  const statusMap: Record<string, MangaDetail['status']> = {
    ongoing: 'ongoing',
    completed: 'completed',
    hiatus: 'hiatus',
    cancelled: 'cancelled'
  };
  return {
    ...toSummary(m),
    author,
    artist,
    description: pickDesc(m.attributes.description ?? {}),
    status: statusMap[m.attributes.status] ?? 'unknown',
    tags: (m.attributes.tags ?? []).map((t) => pickTitle(t.attributes.name))
  };
}

async function mdGet<T>(path: string, params: Record<string, any> = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, String(item));
    } else if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetchWithRetry(url.toString(), {
    headers: { 'User-Agent': UA, Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`MangaDex ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function listManga(params: Record<string, any>, page: number): Promise<PagedList<MangaSummary>> {
  const offset = (page - 1) * PAGE_SIZE;
  const data = await mdGet<{ data: MdManga[]; total: number }>('/manga', {
    limit: PAGE_SIZE,
    offset,
    'includes[]': ['cover_art', 'author', 'artist'],
    'contentRating[]': ['safe', 'suggestive', 'erotica'],
    ...params
  });
  return {
    items: data.data.map(toSummary),
    page,
    hasNext: offset + data.data.length < data.total
  };
}

const STATUS_OPTS = [
  { value: '', label: 'Any' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'hiatus', label: 'Hiatus' },
  { value: 'cancelled', label: 'Cancelled' }
];

const RATING_OPTS = [
  { value: 'safe', label: 'Safe' },
  { value: 'suggestive', label: 'Suggestive' },
  { value: 'erotica', label: 'Erotica' },
  { value: 'pornographic', label: 'Pornographic' }
];

const LANG_OPTS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'es-la', label: 'Spanish (LATAM)' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt-br', label: 'Portuguese (BR)' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'zh-hk', label: 'Chinese (HK)' }
];

const DEMO_OPTS = [
  { value: 'shounen', label: 'Shounen' },
  { value: 'shoujo', label: 'Shoujo' },
  { value: 'seinen', label: 'Seinen' },
  { value: 'josei', label: 'Josei' }
];

function applyFilters(params: Record<string, any>, filters?: FilterValues): void {
  if (!filters) return;
  if (filters.status && filters.status !== '') params.status = filters.status;
  if (Array.isArray(filters.contentRating) && filters.contentRating.length) {
    params['contentRating[]'] = filters.contentRating;
  }
  if (Array.isArray(filters.availableTranslatedLanguage) && filters.availableTranslatedLanguage.length) {
    params['availableTranslatedLanguage[]'] = filters.availableTranslatedLanguage;
  }
  if (Array.isArray(filters.publicationDemographic) && filters.publicationDemographic.length) {
    params['publicationDemographic[]'] = filters.publicationDemographic;
  }
}

export const mangadex: Source = {
  id: 'mangadex',
  name: 'MangaDex',
  lang: 'multi',
  baseUrl: 'https://mangadex.org',

  getFilters(): SourceFilter[] {
    return [
      {
        id: 'status',
        label: 'Status',
        type: 'select',
        options: STATUS_OPTS,
        defaultValue: ''
      },
      {
        id: 'availableTranslatedLanguage',
        label: 'Translated language',
        type: 'multi',
        options: LANG_OPTS,
        defaultValue: ['en']
      },
      {
        id: 'contentRating',
        label: 'Content rating',
        type: 'multi',
        options: RATING_OPTS,
        defaultValue: ['safe', 'suggestive', 'erotica']
      },
      {
        id: 'publicationDemographic',
        label: 'Demographic',
        type: 'multi',
        options: DEMO_OPTS
      }
    ];
  },

  async fetchPopular(page, filters) {
    const params: Record<string, any> = {
      'order[followedCount]': 'desc',
      'availableTranslatedLanguage[]': ['en']
    };
    applyFilters(params, filters);
    return listManga(params, page);
  },

  async fetchLatest(page, filters) {
    const params: Record<string, any> = {
      'order[latestUploadedChapter]': 'desc',
      'availableTranslatedLanguage[]': ['en']
    };
    applyFilters(params, filters);
    return listManga(params, page);
  },

  async search(query, page, filters) {
    const params: Record<string, any> = {
      title: query,
      'availableTranslatedLanguage[]': ['en']
    };
    applyFilters(params, filters);
    return listManga(params, page);
  },

  async fetchDetail(sourceMangaId) {
    const data = await mdGet<{ data: MdManga }>(`/manga/${sourceMangaId}`, {
      'includes[]': ['cover_art', 'author', 'artist']
    });
    return toDetail(data.data);
  },

  async fetchChapters(sourceMangaId) {
    const out: ChapterInfo[] = [];
    const limit = 500;
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
      const data = await mdGet<{ data: MdChapter[]; total: number }>(
        `/manga/${sourceMangaId}/feed`,
        {
          limit,
          offset,
          'translatedLanguage[]': ['en'],
          'order[chapter]': 'asc',
          'contentRating[]': ['safe', 'suggestive', 'erotica'],
          'includes[]': ['scanlation_group']
        }
      );
      total = data.total;
      for (const c of data.data) {
        if (c.attributes.externalUrl) continue;
        const num = parseFloat(c.attributes.chapter ?? '0') || 0;
        const scan = findRel(c.relationships, 'scanlation_group')?.attributes?.name as string | undefined;
        out.push({
          sourceChapterId: c.id,
          number: num,
          title: c.attributes.title || `Chapter ${c.attributes.chapter ?? '?'}`,
          url: `https://mangadex.org/chapter/${c.id}`,
          uploadedAt: Date.parse(c.attributes.publishAt) || undefined,
          scanlator: scan,
          lang: c.attributes.translatedLanguage
        });
      }
      offset += data.data.length;
      if (data.data.length === 0) break;
    }
    out.sort((a, b) => a.number - b.number);
    return out;
  },

  async fetchPageUrls(chapterId) {
    const data = await mdGet<{
      baseUrl: string;
      chapter: { hash: string; data: string[] };
    }>(`/at-home/server/${chapterId}`);
    return data.chapter.data.map((fn) => `${data.baseUrl}/data/${data.chapter.hash}/${fn}`);
  }
};
