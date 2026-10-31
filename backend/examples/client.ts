// Use the same brief type as the visual-planning website.
import type { WeddingBrief } from '../../lib/wedding';

export type Wedding = {
  id: string;
  revision: number;
  status: "draft" | "confirmed";
  brief: WeddingBrief;
  missing_fields: string[];
  budget_summary: { currency: "SGD"; total: string | null; per_guest: string | null; note: string };
  created_at: string;
  updated_at: string;
};

export class PlanningApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(`Planning API request failed (${status})`);
  }
}

export class PlanningClient {
  constructor(private baseUrl: string, private token?: string) {}

  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { "X-Wedding-Token": this.token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw new PlanningApiError(response.status, result.detail);
    return result as T;
  }

  async create(brief: WeddingBrief) {
    const result = await this.request<{ wedding: Wedding; access_token: string }>("/api/weddings", "POST", { brief });
    this.token = result.access_token;
    return result;
  }

  get(id: string) {
    return this.request<{ wedding: Wedding }>(`/api/weddings/${id}`);
  }

  update(wedding: Wedding, brief: Partial<WeddingBrief>) {
    return this.request<{ wedding: Wedding }>(`/api/weddings/${wedding.id}`, "PATCH", {
      expected_revision: wedding.revision, brief,
    });
  }

  // Generate request_id once per user turn. Reuse this exact body for retries.
  chat(id: string, body: { message: string; expected_revision: number; request_id: string }) {
    return this.request<{
      wedding: Wedding; reply: string; changed_fields: string[];
      questions: string[]; request_id: string; agent: "preferences";
    }>(`/api/weddings/${id}/chat`, "POST", body);
  }

  messages(id: string) {
    return this.request<{ messages: { role: "user" | "assistant"; content: string; created_at: string }[] }>(`/api/weddings/${id}/messages`);
  }

  confirm(wedding: Wedding) {
    return this.request<{ wedding: Wedding }>(`/api/weddings/${wedding.id}/confirm`, "POST", {
      expected_revision: wedding.revision,
    });
  }
}
