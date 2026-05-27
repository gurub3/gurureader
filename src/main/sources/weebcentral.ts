import * as cheerio from 'cheerio';
import type { ChapterInfo, MangaDetail, MangaSummary, PagedList, SourceFilter } from '@shared/types';
import type { Source } from './types';
import { fetchWithRetry } from '../fetchUtil';

// WeebCentral renders most listings via HTMX HTML fragments at /search/data.
// Selectors here were verified against the live site.
const SITE = 'https://weebcentral.com';
const PAGE_SIZE = 32;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function wcText(url: string): Promise<string> {
  const res = await fetchWithRetry(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*', Referer: SITE + '/' }
  });
  if (!res.ok) throw new Error(`WeebCentral ${url} -> ${res.status}`);
  return res.text();
}

function idFromSeriesHref(href: string): string | null {
  const m = href.match(/\/series\/([A-Z0-9]+)/);
  return m ? m[1] : null;
}

function idFromChapterHref(href: string): string | null {
  const m = href.match(/\/chapters?\/([A-Z0-9]+)/);
  return m ? m[1] : null;
}

function cleanTitle(s: string | undefined): string {
  if (!s) return '';
  return s.replace(/\s+cover\s*$/i, '').replace(/\s+\|\s*Weeb Central.*$/i, '').trim();
}

function pickCover($el: cheerio.Cheerio<any>): string | undefined {
  const src = $el.find('source[srcset]').first().attr('srcset');
  if (src) return src.split(' ')[0];
  return $el.find('img[src]').first().attr('src') || undefined;
}

function parseListing(html: string): MangaSummary[] {
  const $ = cheerio.load(html);
  const out: MangaSummary[] = [];
  $('article.bg-base-300').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a[href*="/series/"]').first();
    const href = link.attr('href') ?? '';
    const id = idFromSeriesHref(href);
    if (!id) return;
    // Title preference: hidden section anchor > cover overlay > img alt
    const title =
      cleanTitle($el.find('section.hidden a[href*="/series/"]').first().text()) ||
      cleanTitle($el.find('.text-ellipsis.truncate').first().text()) ||
      cleanTitle($el.find('img[alt]').first().attr('alt')) ||
      'Untitled';
    out.push({
      sourceId: 'weebcentral',
      sourceMangaId: id,
      title,
      coverUrl: pickCover($el),
      url: href.startsWith('http') ? href : SITE + href
    });
  });
  return out;
}

async function searchPaged(
  params: Record<string, string>,
  page: number
): Promise<PagedList<MangaSummary>> {
  const offset = (page - 1) * PAGE_SIZE;
  const url = new URL(SITE + '/search/data');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('display_mode', 'Full Display');
  const html = await wcText(url.toString());
  const items = parseListing(html);
  return { items, page, hasNext: items.length >= PAGE_SIZE };
}

function pickStatus(s: string | undefined): MangaDetail['status'] {
  const t = (s ?? '').toLowerCase();
  if (t.includes('ongoing')) return 'ongoing';
  if (t.includes('complete')) return 'completed';
  if (t.includes('hiatus')) return 'hiatus';
  if (t.includes('cancel')) return 'cancelled';
  return 'unknown';
}

// label -> value pairs from "Author(s): Foo / Type: Manga / Status: Ongoing" etc.
function readFields($: cheerio.CheerioAPI): Record<string, string> {
  const out: Record<string, string> = {};
  $('li, div').each((_, el) => {
    const raw = $(el).text().replace(/\s+/g, ' ').trim();
    const m = raw.match(/^([A-Za-z][\w()/ ]+?):\s+(.+)$/);
    if (!m) return;
    const label = m[1].replace(/\(s\)$/i, '').toLowerCase();
    if (out[label] === undefined && m[2].length < 600) out[label] = m[2].trim();
  });
  return out;
}

const SORT_OPTIONS = [
  'Best Match',
  'Alphabet',
  'Popularity',
  'Subscribers',
  'Recently Added',
  'Latest Updates'
];

const ORDER_OPTIONS = ['Descending', 'Ascending'];

const YESNO = ['Any', 'Yes', 'No'];

export const weebcentral: Source = {
  id: 'weebcentral',
  name: 'WeebCentral',
  lang: 'en',
  baseUrl: SITE,

  getFilters(): SourceFilter[] {
    return [
      {
        id: 'sort',
        label: 'Sort by',
        type: 'select',
        options: SORT_OPTIONS.map((s) => ({ value: s, label: s })),
        defaultValue: 'Popularity'
      },
      {
        id: 'order',
        label: 'Order',
        type: 'select',
        options: ORDER_OPTIONS.map((s) => ({ value: s, label: s })),
        defaultValue: 'Descending'
      },
      {
        id: 'official',
        label: 'Official translation',
        type: 'select',
        options: YESNO.map((s) => ({ value: s, label: s })),
        defaultValue: 'Any'
      },
      {
        id: 'anime',
        label: 'Anime adaptation',
        type: 'select',
        options: YESNO.map((s) => ({ value: s, label: s })),
        defaultValue: 'Any'
      },
      {
        id: 'adult',
        label: 'Adult content',
        type: 'select',
        options: YESNO.map((s) => ({ value: s, label: s })),
        defaultValue: 'Any'
      }
    ];
  },

  async fetchPopular(page, filters) {
    return searchPaged(
      {
        author: '',
        text: '',
        sort: (filters?.sort as string) || 'Popularity',
        order: (filters?.order as string) || 'Descending',
        official: (filters?.official as string) || 'Any',
        anime: (filters?.anime as string) || 'Any',
        adult: (filters?.adult as string) || 'Any'
      },
      page
    );
  },

  async fetchLatest(page, filters) {
    return searchPaged(
      {
        author: '',
        text: '',
        sort: 'Latest Updates',
        order: (filters?.order as string) || 'Descending',
        official: (filters?.official as string) || 'Any',
        anime: (filters?.anime as string) || 'Any',
        adult: (filters?.adult as string) || 'Any'
      },
      page
    );
  },

  async search(query, page, filters) {
    return searchPaged(
      {
        author: '',
        text: query,
        sort: (filters?.sort as string) || 'Best Match',
        order: (filters?.order as string) || 'Descending',
        official: (filters?.official as string) || 'Any',
        anime: (filters?.anime as string) || 'Any',
        adult: (filters?.adult as string) || 'Any'
      },
      page
    );
  },

  async fetchDetail(id) {
    const html = await wcText(`${SITE}/series/${id}`);
    const $ = cheerio.load(html);
    const fields = readFields($);
    const title =
      cleanTitle($('section h1').first().text()) ||
      cleanTitle($('h1').first().text()) ||
      cleanTitle($('meta[property="og:title"]').attr('content')) ||
      'Untitled';
    const cover =
      $('meta[property="og:image"]').attr('content') ||
      $('picture source[srcset]').first().attr('srcset')?.split(' ')[0] ||
      undefined;
    const description = ($('p.whitespace-pre-wrap').first().text() || '').trim();

    const tags: string[] = [];
    $('a[href*="search"], a[href*="genre"]').each((_, e) => {
      const t = $(e).text().trim();
      if (t && t.length < 30 && !tags.includes(t) && !/^(read|home|series)$/i.test(t)) {
        tags.push(t);
      }
    });

    return {
      sourceId: 'weebcentral',
      sourceMangaId: id,
      title,
      coverUrl: cover,
      url: `${SITE}/series/${id}`,
      author: fields['author'],
      artist: fields['artist'],
      description,
      status: pickStatus(fields['status']),
      tags
    };
  },

  async fetchChapters(id) {
    const html = await wcText(`${SITE}/series/${id}/full-chapter-list`);
    const $ = cheerio.load(html);
    const out: ChapterInfo[] = [];
    $('a[href*="/chapters/"]').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href') ?? '';
      const cid = idFromChapterHref(href);
      if (!cid) return;
      const raw = $a.text().replace(/\s+/g, ' ').trim();
      const numMatch = raw.match(/Chapter\s*([\d.]+)/i) || raw.match(/^Ch(?:ap(?:ter)?)?\.?\s*([\d.]+)/i);
      const num = numMatch ? parseFloat(numMatch[1]) : 0;
      // Strip the "Last Read" badge text + svg style noise
      const cleanLabel = raw.replace(/Last Read.*$/i, '').replace(/\.[a-z0-9-]+\s*\{[^}]*\}/g, '').trim();
      const time = $a.find('time').attr('datetime');
      out.push({
        sourceChapterId: cid,
        number: num,
        title: cleanLabel || `Chapter ${num}`,
        url: href.startsWith('http') ? href : SITE + href,
        uploadedAt: time ? Date.parse(time) : undefined
      });
    });
    const seen = new Set<string>();
    const dedup = out.filter((c) => {
      if (seen.has(c.sourceChapterId)) return false;
      seen.add(c.sourceChapterId);
      return true;
    });
    dedup.sort((a, b) => a.number - b.number);
    return dedup;
  },

  async fetchPageUrls(chapterId) {
    const html = await wcText(`${SITE}/chapters/${chapterId}/images?reading_style=long_strip`);
    const $ = cheerio.load(html);
    const urls: string[] = [];
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (src && /^https?:\/\//.test(src) && /\.(jpe?g|png|webp|gif)/i.test(src)) urls.push(src);
    });
    return urls;
  }
};
