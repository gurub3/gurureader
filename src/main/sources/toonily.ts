import * as cheerio from 'cheerio';
import type {
  ChapterInfo,
  FilterValues,
  MangaDetail,
  MangaSummary,
  PagedList,
  SourceFilter
} from '@shared/types';
import type { Source } from './types';
import { cfFetch, getRenderedImageUrls } from '../cfbypass';

// Toonily uses the WordPress "Madara" theme. CloudFlare-protected, so all
// fetches go through cfFetch (Electron net + auto-solve).
const SITE = 'https://toonily.com';

async function toonText(url: string): Promise<string> {
  const res = await cfFetch(url, {
    headers: {
      Accept: 'text/html,*/*',
      Referer: SITE + '/',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  if (!res.ok) throw new Error(`Toonily ${url} -> ${res.status}`);
  return res.text();
}

function absUrl(href: string): string {
  return href.startsWith('http') ? href : new URL(href, SITE).toString();
}

function slugFromHref(href: string): string | null {
  // /webtoon/{slug}/ or /serie/{slug}/
  const m = href.match(/\/(?:webtoon|serie|manga)\/([^/?#]+)/);
  return m ? m[1] : null;
}

function chapterSlugFromHref(href: string): string | null {
  // /webtoon/{manga-slug}/chapter-N/
  const m = href.match(/\/(?:webtoon|serie|manga)\/[^/]+\/([^/?#]+)/);
  return m ? m[1] : null;
}

function parseListing(html: string): MangaSummary[] {
  const $ = cheerio.load(html);
  const out: MangaSummary[] = [];
  const seen = new Set<string>();
  // Madara theme uses .page-item-detail or .item-summary etc.
  $('.page-item-detail, .manga-item, .c-tabs-item__content').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a[href*="/webtoon/"], a[href*="/serie/"], a[href*="/manga/"]').first();
    const href = link.attr('href') ?? '';
    const slug = slugFromHref(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    const title =
      $el.find('.post-title a, h3 a, h5 a').first().text().trim() ||
      link.attr('title')?.trim() ||
      $el.find('img[alt]').first().attr('alt')?.trim() ||
      'Untitled';
    const cover =
      $el.find('img[data-src]').first().attr('data-src') ||
      $el.find('img[src]').first().attr('src') ||
      undefined;
    out.push({
      sourceId: 'toonily',
      sourceMangaId: slug,
      title,
      coverUrl: cover,
      url: absUrl(href)
    });
  });
  return out;
}

const SORT_OPTS = [
  { value: 'trending', label: 'Trending' },
  { value: 'views', label: 'Most views' },
  { value: 'new-manga', label: 'New' },
  { value: 'latest', label: 'Latest update' },
  { value: 'rating', label: 'Rating' },
  { value: 'alphabet', label: 'A-Z' }
];

export const toonily: Source = {
  id: 'toonily',
  name: 'Toonily',
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
        defaultValue: 'trending'
      }
    ];
  },

  async fetchPopular(page, filters) {
    const sort = (filters?.sort as string) || 'trending';
    const url = `${SITE}/search/?m_orderby=${sort}&page=${page}`;
    const html = await toonText(url);
    const items = parseListing(html);
    return { items, page, hasNext: items.length > 0 };
  },

  async fetchLatest(page) {
    const url = `${SITE}/search/?m_orderby=latest&page=${page}`;
    const html = await toonText(url);
    const items = parseListing(html);
    return { items, page, hasNext: items.length > 0 };
  },

  async search(query, page) {
    const q = encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, '+'));
    const url = `${SITE}/search/${q}/?page=${page}`;
    const html = await toonText(url);
    const items = parseListing(html);
    return { items, page, hasNext: items.length > 0 };
  },

  async fetchDetail(slug) {
    const url = `${SITE}/webtoon/${slug}/`;
    const html = await toonText(url);
    const $ = cheerio.load(html);
    const title =
      $('.post-title h1').first().text().trim() ||
      $('h1.entry-title').first().text().trim() ||
      $('h1').first().text().trim() ||
      'Untitled';
    const cover =
      $('.summary_image img').first().attr('data-src') ||
      $('.summary_image img').first().attr('src') ||
      $('meta[property="og:image"]').attr('content') ||
      undefined;
    const description =
      $('.description-summary .summary__content').first().text().trim() ||
      $('.summary__content, .post-content_item .summary-content').first().text().trim() ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    const fields: Record<string, string> = {};
    $('.post-content_item').each((_, el) => {
      const label = $(el).find('.summary-heading').first().text().trim().toLowerCase();
      const value = $(el).find('.summary-content').first().text().replace(/\s+/g, ' ').trim();
      if (label) fields[label] = value;
    });

    const statusText = (fields['status'] || '').toLowerCase();
    const status: MangaDetail['status'] = statusText.includes('ongoing')
      ? 'ongoing'
      : statusText.includes('complete')
        ? 'completed'
        : statusText.includes('hiatus')
          ? 'hiatus'
          : statusText.includes('cancel')
            ? 'cancelled'
            : 'unknown';

    const tags: string[] = [];
    $('.genres-content a, .wp-manga-tags-list a').each((_, e) => {
      const t = $(e).text().trim();
      if (t && t.length < 40 && !tags.includes(t)) tags.push(t);
    });

    return {
      sourceId: 'toonily',
      sourceMangaId: slug,
      title,
      coverUrl: cover,
      url,
      author: fields['author(s)'] || fields['author'] || fields['authors'],
      artist: fields['artist(s)'] || fields['artist'] || fields['artists'],
      description,
      status,
      tags
    };
  },

  async fetchChapters(slug) {
    const url = `${SITE}/webtoon/${slug}/`;
    const html = await toonText(url);
    const $ = cheerio.load(html);
    const out: ChapterInfo[] = [];
    $('.wp-manga-chapter a, li.wp-manga-chapter > a').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href') ?? '';
      const cslug = chapterSlugFromHref(href);
      if (!cslug) return;
      const raw = $a.text().replace(/\s+/g, ' ').trim();
      const numMatch = raw.match(/Chapter\s*([\d.]+)/i) || raw.match(/([\d.]+)/);
      const num = numMatch ? parseFloat(numMatch[1]) : 0;
      const dateText = $a.closest('li').find('.chapter-release-date, .chapter-date').first().text().trim();
      const upl = Date.parse(dateText);
      // Encode both manga and chapter slugs in the id so fetchPageUrls can
      // rebuild the chapter URL. Use a separator that's safe in filenames
      // (chapter id is also used as a download directory name).
      out.push({
        sourceChapterId: `${slug}__${cslug}`,
        number: num,
        title: raw || `Chapter ${num}`,
        url: absUrl(href),
        uploadedAt: Number.isFinite(upl) ? upl : undefined
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
    const sepIdx = chapterId.indexOf('__');
    if (sepIdx === -1) {
      throw new Error(`Toonily chapter id missing manga slug: ${chapterId}`);
    }
    const mangaSlug = chapterId.substring(0, sepIdx);
    const chapterSlug = chapterId.substring(sepIdx + 2);
    const url = `${SITE}/webtoon/${mangaSlug}/${chapterSlug}/?style=list`;
    const html = await toonText(url);
    const $ = cheerio.load(html);
    const urls: string[] = [];
    $('.reading-content img, .page-break img').each((_, el) => {
      const src = ($(el).attr('data-src') || $(el).attr('src') || '').trim();
      if (/^https?:\/\//.test(src) && /\.(jpe?g|png|webp|gif)/i.test(src)) {
        urls.push(src);
      }
    });
    if (urls.length > 0) return urls;
    // Fallback: render the page (covers cases where images are lazy-loaded
    // via JS that cheerio doesn't see).
    const rendered = await getRenderedImageUrls(url, { waitMs: 8000, minCount: 2 });
    return rendered.filter((u) => !/\/(static|assets|favicon|logo|avatar)/i.test(u));
  }
};
