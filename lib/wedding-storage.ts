import { parsePersonality } from './personality.ts';
import { readStoredBrief, type WeddingBrief } from './wedding.ts';

export const PERSONALITY_STORAGE = 'ever-after-personality-v3';
export const BRIEF_STORAGE = 'ever-after-wedding-brief-v1';

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem'>;

// The v3 record is the current local draft. The v1 key is a compatibility mirror.
export function readLocalBrief(storage: BrowserStorage): WeddingBrief | null {
  const current = storage.getItem(PERSONALITY_STORAGE);
  if (current) {
    try {
      const record = JSON.parse(current);
      const profile = parsePersonality(record.profile);
      const brief = readStoredBrief(record.brief);
      if (profile && brief) return { ...brief, personality: profile };
    } catch { /* Fall back to the compatible brief if a stored record is damaged. */ }
  }
  const legacy = storage.getItem(BRIEF_STORAGE);
  try { return legacy ? readStoredBrief(JSON.parse(legacy)) : null; }
  catch { return null; }
}

export function persistLocalBrief(storage: BrowserStorage, brief: WeddingBrief): void {
  let record: Record<string, unknown> = {};
  try { record = JSON.parse(storage.getItem(PERSONALITY_STORAGE) || '{}'); } catch { /* Repair an unreadable local draft. */ }
  storage.setItem(PERSONALITY_STORAGE, JSON.stringify({ ...record, profile: brief.personality, brief }));
  storage.setItem(BRIEF_STORAGE, JSON.stringify(brief));
}

export function briefsMatch(left: WeddingBrief, right: WeddingBrief): boolean {
  const a = readStoredBrief(left); const b = readStoredBrief(right);
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}
