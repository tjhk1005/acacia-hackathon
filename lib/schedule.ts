export type ScheduleSnapshot = {
  id: string; vendor_id: string; title: string; due_at: string; done: boolean; revision: number;
};
export type ScheduleNotification = {
  id: string; kind: string; title: string; detail: string; created_at: string; read_at: string | null;
  change?: {
    id: string; status: 'pending' | 'approved' | 'rejected' | 'stale';
    before: ScheduleSnapshot; after: ScheduleSnapshot; reason: string; brief_revision: number;
  };
};
export type ScheduleInboxState = { notifications: ScheduleNotification[]; unread_count: number; pending_count: number };
export const SCHEDULE_UPDATED = 'ever-after-schedule-updated';
