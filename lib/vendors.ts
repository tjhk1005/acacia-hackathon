import type { Wedding } from './planning-api';

export type Diet = 'halal' | 'vegetarian' | 'vegan';
export type VendorCriteria = { catering_budget: string | null; dietary_requirements: Diet[]; service_style: 'any' | 'buffet' | 'plated' };
export type Vendor = {
  id: string; name: string; tagline: string; description: string; service_style: 'buffet' | 'plated';
  dietary_support: Diet[]; unpriced_dietary_extras: Diet[]; min_billable_guests: number; max_guests: number;
  per_guest: string; delivery_setup: string; service_percent: string; tax_percent: string;
  inclusions: string[]; exclusions: string[]; service_area: string;
  source: 'fictional_sample'; availability: 'unconfirmed';
};
export type Estimate = {
  guests: number; billable_guests: number; food_subtotal: string; delivery_setup: string;
  service_charge: string; tax: string; total: string; budget_difference: string | null;
};
export type VendorResult = { vendor: Vendor; estimate: Estimate | null; matches: boolean; reasons: string[]; concerns: string[] };
export type VendorState = {
  wedding: Wedding; revision: number; criteria: VendorCriteria; shortlisted_ids: string[];
  needs_review: boolean; matched_count: number; results: VendorResult[]; catalogue_note: string;
};
export const emptyCriteria: VendorCriteria = { catering_budget: null, dietary_requirements: [], service_style: 'any' };
export function sgd(amount: string | null | undefined): string {
  return amount == null ? 'Not estimated' : `S$${Number(amount).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
