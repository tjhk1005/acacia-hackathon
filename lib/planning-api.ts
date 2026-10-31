import type { WeddingBrief } from './wedding';

export type Wedding = {
  id: string; revision: number; status: 'draft' | 'confirmed'; brief: WeddingBrief;
  missing_fields: string[];
  budget_summary: { currency: 'SGD'; total: string | null; per_guest: string | null; note: string };
};
export type Message = { role: 'user' | 'assistant'; content: string; created_at: string };
export type Session = { id: string; token: string };
export type ChatTurn = { message: string; expected_revision: number; request_id: string };
export { BRIEF_STORAGE, briefsMatch, readLocalBrief, persistLocalBrief } from './wedding-storage.ts';
export const SESSION_STORAGE = 'ever-after-planner-session-v1';

export class PlanningError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) { super(message); this.status = status; this.code = code; }
}

function explain(status: number, detail: unknown): string {
  if (detail && typeof detail === 'object' && 'code' in detail && detail.code === 'database_not_configured') return 'Your planner needs shared storage. Connect a PostgreSQL database in Vercel Storage, enable DATABASE_URL for the backend service, then redeploy. Your quiz is still saved in this browser.';
  if (status === 409) return 'Your brief changed while we were working. We’ve refreshed it; review it before trying again.';
  if (status === 404 && detail && typeof detail === 'object' && 'code' in detail && detail.code === 'wedding_not_found') return 'This saved conversation is no longer available on the server. Your saved wedding vision is still in this browser.';
  if (status === 404) return 'The requested planning endpoint or record could not be found. Please check the deployment configuration.';
  if (status === 503 && detail && typeof detail === 'object' && 'code' in detail && detail.code === 'ai_not_configured') return 'Your AI planner isn’t connected yet. You can still edit and save your wedding brief.';
  if (status === 503) return 'The planning service is unavailable. Your saved wedding vision is still in this browser. Please try again once the service is connected.';
  if (status === 502 && detail && typeof detail === 'object' && 'code' in detail && detail.code === 'backend_route_not_found') return 'The planning API route is not connected correctly. Please check the Vercel service configuration.';
  if (status === 502 || status === 504) return 'Your planner couldn’t reply just now. Your message is still here; please try again.';
  if (Array.isArray(detail)) return detail.map(item => {
    const field = Array.isArray(item.loc) ? item.loc.filter((part: string) => part !== 'body' && part !== 'brief').join(' · ') : 'Details';
    return `${field}: ${item.msg}`;
  }).join('. ');
  if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message);
  if (typeof detail === 'string') return detail;
  return 'We couldn’t save that change. Please check your details and try again.';
}

export async function planningRequest<T>(path: string, session?: Session | null, body?: unknown, method = body === undefined ? 'GET' : 'POST', timeoutMs = 45000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`/planning-api${path}`, {
      method, cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(session ? { 'X-Wedding-Token': session.token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let result;
    try { result = await response.json(); }
    catch { throw new PlanningError(502, 'The planning service returned an unexpected response. Please check the deployment configuration.', 'invalid_backend_response'); }
    if (!response.ok) {
      const code = result.detail && typeof result.detail === 'object' ? result.detail.code : undefined;
      throw new PlanningError(response.status, explain(response.status, result.detail), code);
    }
    return result as T;
  } catch (error) {
    if (error instanceof PlanningError) throw error;
    throw new PlanningError(0, 'We couldn’t reach your planner. Your message and unsaved edits are still here. Please try again.');
  } finally { clearTimeout(timer); }
}
