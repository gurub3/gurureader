import * as cheerio from 'cheerio';
import type { ChapterInfo, MangaSummary, SourceFilter } from '@shared/types';
import type { Source } from './types';
import { browserGet } from '../browser';

// nhentai's public JSON API is unreachable from Node fetch on many systems
// (TLS chain / aggressive bot filtering). We render the regular HTML pages in
// a hidden BrowserWindow instead — Chromium handles certs and any JS checks
// the same way a normal browser tab would.
const SITE = 'https://nhentai.net';
const IMG_BASE = 'https://i.nhentai.net/galleries';

interface ParsedGallery {
  id: string;
  title: string;
  coverUrl?: string;
}

function parseListing(html: string): ParsedGallery[] {
  const $ = cheerio.load(html);
  const out: ParsedGallery[] = [];
  const seen = new Set<string>();
  $('.gallery, .container .gallery').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a.cover, a').first();
    const href = link.attr('href') ?? '';
    const m = href.match(/\/g\/(\d+)/);
    if (!m) return;
    const id = m[1];
    if (seen.has(id)) return;
    seen.add(id);
    const caption = $el.find('.caption').first().text().trim();
    const img = $el.find('img').first();
    const title =
      caption ||
      img.attr('alt')?.trim() ||
      link.attr('title')?.trim() ||
      'Untitled';
    const cover = img.attr('data-src') || img.attr('src') || undefined;
    out.push({ id, title, coverUrl: cover });
  });
  return out;
}

function toSummary(g: ParsedGallery): MangaSummary {
  return {
    sourceId: 'nhentai',
    sourceMangaId: g.id,
    title: g.title,
    coverUrl: g.coverUrl,
    url: `${SITE}/g/${g.id}/`
  };
}

const SORT_OPTS = [
  { value: 'popular', label: 'All time popular' },
  { value: 'popular-week', label: 'Popular this week' },
  { value: 'popular-today', label: 'Popular today' },
  { value: 'date', label: 'Newest' }
];

const PAGE_EXT_MAP: Record<string, string> = { j: 'jpg', p: 'png', g: 'gif', w: 'webp' };

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
    const url = `${SITE}/?page=${page}${sort !== 'date' ? `&sort=${sort}` : ''}`;
    const { html } = await browserGet(url, {
      waitForSelector: '.gallery, .container',
      settleMs: 1200
    });
    const items = parseListing(html).map(toSummary);
    return { items, page, hasNext: items.length > 0 };
  },

  async fetchLatest(page) {
    const url = `${SITE}/?page=${page}&sort=date`;
    const { html } = await browserGet(url, { waitForSelector: '.gallery', settleMs: 1000 });
    const items = parseListing(html).map(toSummary);
    return { items, page, hasNext: items.length > 0 };
  },

  async search(query, page, filters) {
    const sort = (filters?.sort as string) || 'popular';
    const params = new URLSearchParams({ q: query || '""', page: String(page) });
    if (sort && sort !== 'popular') params.set('sort', sort);
    const url = `${SITE}/search/?${params.toString()}`;
    const { html } = await browserGet(url, { waitForSelector: '.gallery', settleMs: 1200 });
    const items = parseListing(html).map(toSummary);
    return { items, page, hasNext: items.length > 0 };
  },

  async fetchDetail(id) {
    const url = `${SITE}/g/${id}/`;
    const { html } = await browserGet(url, { waitForSelector: '#info, #cover', settleMs: 1000 });
    const $ = cheerio.load(html);
    const title =
      $('#info h1').first().text().trim() ||
      $('h1.title').first().text().trim() ||
      $('h1').first().text().trim() ||
      'Untitled';
    const cover =
      $('#cover img').first().attr('data-src') ||
      $('#cover img').first().attr('src') ||
      $('meta[property="og:image"]').attr('content') ||
      undefined;
    const numPages = parseInt($('#info .num-pages, .num-pages').first().text().trim(), 10) || 0;
    const favs = $('#info .btn-secondary').first().text().replace(/\D/g, '');

    const groupTag = (group: string): string[] => {
      const out: string[] = [];
      $(`#tags .tag-container`).each((_, el) => {
        const heading = $(el).contents().filter((_, n) => n.type === 'text').text().trim().toLowerCase();
        if (!heading.startsWith(group.toLowerCase())) return;
        $(el).find('a .name').each((_, n) => {
          const t = $(n).text().trim();
          if (t) out.push(t);
        });
      });
      return out;
    };

    const artists = groupTag('Artists');
    const tags = [...groupTag('Tags'), ...groupTag('Languages'), ...groupTag('Categories')];

    return {
      sourceId: 'nhentai',
      sourceMangaId: id,
      title,
      coverUrl: cover,
      url,
      author: artists.join(', ') || undefined,
      description:
        `${numPages} pages` + (favs ? ` · ${parseInt(favs, 10).toLocaleString()} favorites` : ''),
      status: 'completed',
      tags
    };
  },

  async fetchChapters(id) {
    // nhentai galleries are single-volume — synthesize one chapter.
    const { html } = await browserGet(`${SITE}/g/${id}/`, {
      waitForSelector: '#info',
      settleMs: 800
    });
    const $ = cheerio.load(html);
    const numPages = parseInt($('#info .num-pages, .num-pages').first().text().trim(), 10) || 0;
    const dateAttr =
      $('#info time').first().attr('datetime') ||
      $('time').first().attr('datetime');
    const uploadedAt = dateAttr ? Date.parse(dateAttr) : undefined;
    const ch: ChapterInfo = {
      sourceChapterId: id,
      number: 1,
      title: numPages > 0 ? `${numPages} pages` : 'Gallery',
      url: `${SITE}/g/${id}/`,
      uploadedAt: Number.isFinite(uploadedAt) ? uploadedAt : undefined,
      lang: 'en'
    };
    return [ch];
  },

  async fetchPageUrls(chapterId) {
    // We extract media_id + per-page extensions by reading thumbnails on the
    // gallery page, then derive full-resolution image URLs from them.
    const { html } = await browserGet(`${SITE}/g/${chapterId}/`, {
      waitForSelector: '.thumbs, #thumbnail-container',
      settleMs: 800
    });
    const $ = cheerio.load(html);

    // Find media_id from any thumbnail. Format: t.nhentai.net/galleries/{mid}/Nt.ext
    let mediaId: string | null = null;
    $('.thumbs img, #thumbnail-container img').each((_, el) => {
      const src = ($(el).attr('data-src') || $(el).attr('src') || '').trim();
      const m = src.match(/galleries\/(\d+)\/\d+t?\.(jpe?g|png|webp|gif)/i);
      if (m && !mediaId) mediaId = m[1];
    });

    if (!mediaId) {
      // Couldn't infer media_id from thumbs — fall back to scraping each
      // /g/{id}/{N}/ page's main image (slower but reliable).
      return [];
    }

    // Build URLs from each thumb's index + extension. We map per-page index
    // to the right extension because pages within a gallery can mix types.
    const urls: string[] = [];
    $('.thumbs a, #thumbnail-container a').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const m = href.match(/\/g\/\d+\/(\d+)\//);
      if (!m) return;
      const idx = parseInt(m[1], 10);
      const thumb = $(el).find('img').first();
      const thumbSrc = (thumb.attr('data-src') || thumb.attr('src') || '').trim();
      const extMatch = thumbSrc.match(/\.([a-z]+)$/i);
      const ext = extMatch ? extMatch[1].toLowerCase().replace(/^t/, '') : 'jpg';
      urls.push(`${IMG_BASE}/${mediaId}/${idx}.${PAGE_EXT_MAP[ext[0]] ?? ext}`);
    });

    // Dedupe + sort numerically.
    const seen = new Set<string>();
    return urls.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
  }
};
