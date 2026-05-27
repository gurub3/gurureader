import type {
  ChapterInfo,
  FilterValues,
  MangaDetail,
  MangaSummary,
  PagedList,
  SourceFilter,
  SourceInfo
} from '@shared/types';

export interface Source extends SourceInfo {
  getFilters?(): SourceFilter[];
  fetchPopular(page: number, filters?: FilterValues): Promise<PagedList<MangaSummary>>;
  fetchLatest?(page: number, filters?: FilterValues): Promise<PagedList<MangaSummary>>;
  search(query: string, page: number, filters?: FilterValues): Promise<PagedList<MangaSummary>>;
  fetchDetail(sourceMangaId: string): Promise<MangaDetail>;
  fetchChapters(sourceMangaId: string): Promise<ChapterInfo[]>;
  fetchPageUrls(chapterId: string): Promise<string[]>;
}
