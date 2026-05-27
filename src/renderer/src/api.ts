import type { ApiBridge } from '@shared/types';

declare global {
  interface Window {
    reader: ApiBridge;
  }
}

export const api: ApiBridge = window.reader;
