// Module-level cache of UI state that needs to outlive route unmounts.
// Lives for the app's lifetime; not persisted to disk.

import type { FilterValues, MangaSummary } from '@shared/types';

export interface BrowseSnapshot {
  kind: 'popular' | 'latest' | 'search';
  query: string;
  activeQuery: string;
  filters: FilterValues;
  appliedFilters: FilterValues;
  page: number;
  items: MangaSummary[];
  hasNext: boolean;
  scrollTop: number;
}

const browseCache = new Map<string, BrowseSnapshot>();

export function getBrowseSnapshot(sourceId: string): BrowseSnapshot | undefined {
  return browseCache.get(sourceId);
}

export function saveBrowseSnapshot(sourceId: string, snap: BrowseSnapshot): void {
  browseCache.set(sourceId, snap);
}

export interface LibrarySnapshot {
  tab: string;
  query: string;
  scrollTop: number;
}

let librarySnap: LibrarySnapshot | undefined;

export function getLibrarySnapshot(): LibrarySnapshot | undefined {
  return librarySnap;
}

export function saveLibrarySnapshot(snap: LibrarySnapshot): void {
  librarySnap = snap;
}

// Find the scrolling container (the main content pane).
export function getMainScroll(): HTMLElement | null {
  return document.querySelector('.main') as HTMLElement | null;
}
