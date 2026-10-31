import { emptyDecor, styles, type Decor } from './inspiration.ts';
import { emptyPersonality, parsePersonality, type PersonalityProfile } from './personality.ts';
export { styles } from './inspiration.ts';
export const priorities = ['Beautiful food', 'Flowers & styling', 'Photography', 'A lovely venue', 'Music & atmosphere', 'Keeping it intimate'];
export type WeddingBrief = {
  names: string; date: string; flexibleDate: boolean; location: string; guests: string; budget: string;
  keywords: string; style: string; direction: string; decor: Decor; priorities: string[]; notes: string;
  personality: PersonalityProfile;
};
export const emptyBrief: WeddingBrief = {
  names: '', date: '', flexibleDate: true, location: '', guests: '', budget: '',
  keywords: '', style: '', direction: '', decor: { ...emptyDecor }, priorities: [], notes: '',
  personality: emptyPersonality,
};
export function getDirection(brief: WeddingBrief) {
  return styles.find(style => style.id === brief.style)?.directions.find(direction => direction.id === brief.direction);
}
// Preserve v1 briefs, including the old coastal style, while asking users to refine their direction.
export function readStoredBrief(value: unknown): WeddingBrief | null {
  if (!value || typeof value !== 'object') return null;
  const brief = value as Record<string, unknown>;
  const keys = ['names', 'date', 'location', 'guests', 'budget', 'keywords', 'style', 'notes'];
  if (!keys.every(key => typeof brief[key] === 'string') || typeof brief.flexibleDate !== 'boolean' ||
    !Array.isArray(brief.priorities) || !brief.priorities.every(item => typeof item === 'string')) return null;
  const styleId = brief.style === 'coastal' ? 'beach' : brief.style;
  const style = styles.find(item => item.id === styleId);
  if (!style && styleId !== '') return null;
  const direction = style?.directions.find(item => item.id === brief.direction);
  const decor = brief.decor && typeof brief.decor === 'object' ? brief.decor as Record<string, unknown> : {};
  return {
    names: brief.names as string, date: brief.date as string, flexibleDate: brief.flexibleDate,
    location: brief.location as string, guests: brief.guests as string, budget: brief.budget as string,
    keywords: brief.keywords as string, style: styleId as string, direction: direction?.id ?? '',
    decor: Object.fromEntries(Object.keys(emptyDecor).map(key => [key, typeof decor[key] === 'string' ? decor[key] : ''])) as Decor,
    priorities: brief.priorities.filter(item => priorities.includes(item)).slice(0, 3), notes: brief.notes as string,
    personality: parsePersonality(brief.personality) ?? structuredClone(emptyPersonality),
  };
}
export function formatMoney(value: string) { return `S$${new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 }).format(Number(value))}`; }
