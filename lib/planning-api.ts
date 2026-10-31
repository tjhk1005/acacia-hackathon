import type { WeddingBrief } from './wedding';

export type Wedding = {
  id: string; revision: number; status: 'draft' | 'confirmed'; brief: WeddingBrief;
  missing_fields: string[];
  budget_summary: { currency: 'SGD'; total: string | null; per_guest: string | null; note: string };
};
export type Message = { role: 'user' | 'assistant'; content: string; created_at: string };
export type Session = { id: string; token: string };
export type ChatTurn = { message: string; expected_revision: number; request_id: string };
export const BRIEF_STORAGE = 'ever-after-wedding-brief-v1';
export const SESSION_STORAGE = 'ever-after-planner-session-v1';

export function briefsMatch(left: WeddingBrief, right: WeddingBrief): boolean {
  return (Object.keys(left) as (keyof WeddingBrief)[]).every(key => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

export class PlanningError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function explain(status: number, detail: unknown): string {
  if (status === 409) return 'Your brief changed while we were working. We’ve refreshed it; review it before trying again.';
  if (status === 404) return 'We couldn’t reopen this wedding. Check your connection, or start a new conversation.';
  if (status === 503) return 'Your AI planner isn’t connected yet. You can still edit and save your wedding brief.';
  if (status === 502 || status === 504) return 'Your planner couldn’t reply just now. Your message is still here; please try again.';
  if (Array.isArray(detail)) return detail.map(item => {
    const field = Array.isArray(item.loc) ? item.loc.filter((part: string) => part !== 'body' && part !== 'brief').join(' · ') : 'Details';
    return `${field}: ${item.msg}`;
  }).join('. ');
  if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message);
  if (typeof detail === 'string') return detail;
  return 'We couldn’t save that change. Please check your details and try again.';
}

export async function planningRequest<T>(path: string, session?: Session | null, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`/planning-api${path}`, {
      method, cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(session ? { 'X-Wedding-Token': session.token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new PlanningError(response.status, explain(response.status, result.detail));
    return result as T;
  } catch (error) {
    if (error instanceof PlanningError) throw error;
    throw new PlanningError(0, 'We couldn’t reach your planner. Your message and unsaved edits are still here. Please try again.');
  } finally { clearTimeout(timer); }
}
