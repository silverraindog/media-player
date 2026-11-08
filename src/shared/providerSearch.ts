export type ProviderName = 'tvmaze' | 'omdb';
export type ProviderMediaType = 'movie' | 'series';

export interface ProviderResult {
  id: string;
  source: ProviderName;
  title: string;
  type: ProviderMediaType;
  year?: number;
  overview?: string;
  posterUrl?: string;
  url: string;
}
