export type Binding = {
  vendor_id: string; recipient: string; revision: number; mode: 'off' | 'review' | 'automatic';
  opt_in: boolean; consent_note: string; consent_revision: number; window_open: boolean;
  needs_reapproval: boolean; stopped: boolean;
};
export type MessagingState = {
  provider: 'twilio' | 'meta'; configured: boolean; enabled: boolean; verified: boolean; piloting: boolean;
  worker_active: boolean; display_phone: string; template_verified: boolean; missing: string[];
  last_error: string; incoming_webhook: string; status_webhook: string; bindings: Binding[];
  deliveries: { message_id: string; vendor_id: string; status: string; provider_id: string | null; error: string; created_at: string }[];
};
export const deliveryLabels: Record<string, string> = {
  queued: 'Queued', waiting_window: 'Waiting for a fresh vendor message', sending: 'Submitting to provider',
  accepted: 'Accepted by provider', sent: 'Sent', delivered: 'Delivered', read: 'Read',
  failed: 'Failed — review required', uncertain: 'Result uncertain — check WhatsApp before retrying', cancelled: 'Cancelled',
};
