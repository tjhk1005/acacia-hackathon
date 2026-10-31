export type PinterestImage = { id: string; src: string; alt: string; pinterest: string };
export type PinterestStatus = 'configured' | 'connected' | 'not_configured' | 'access_required' | 'rate_limited' | 'unavailable';
export type PinterestResult = { status: PinterestStatus; images: PinterestImage[]; bookmark?: string };

// Only accept Pinterest-hosted images and numeric Pin IDs from the provider response.
export function normalisePinterestResponse(value: unknown): PinterestImage[] {
  if (!value || typeof value !== 'object') return [];
  const items = (value as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  const images: PinterestImage[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== 'string' || !/^\d+$/.test(item.id)) continue;
    const media = item.media as { images?: Record<string, { url?: unknown; width?: number }> } | undefined;
    const candidates = Object.values(media?.images ?? {}).filter(image => typeof image?.url === 'string').sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    const src = candidates.map(image => image.url as string).find(url => {
      try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname.endsWith('.pinimg.com'); } catch { return false; }
    });
    if (!src || images.some(image => image.id === item.id)) continue;
    images.push({id:item.id, src, alt:typeof item.title === 'string' ? item.title : 'Wedding inspiration from Pinterest', pinterest:`https://www.pinterest.com/pin/${item.id}/`});
  }
  return images;
}
