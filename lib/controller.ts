import type { Wedding } from './planning-api';

export type AgentRole = 'couple' | 'vendor_communication' | 'vendor_comparison' | 'coordinator';
export type TaskStatus = 'ready' | 'completed' | 'blocked' | 'needs_clarification' | 'needs_user_decision' | 'waiting_for_vendor';
export type Assignment = {
  key: string; agent: AgentRole; title: string; detail: string; status: TaskStatus;
  priority: number; depends_on: string[]; evidence_ids: string[]; action_href: string; brief_revision: number;
};
export type Contact = {
  id: string; name: string; category: string; channel: 'whatsapp' | 'telegram'; contact: string;
  active?: boolean; availability: 'unknown' | 'available' | 'unavailable'; evidence_id: string | null;
};
export type Deliverable = { id: string; vendor_id: string; title: string; due_at: string; done: boolean };
export type VendorMessage = {
  id: string; vendor_id: string; content: string; direction: 'incoming' | 'outgoing';
  status: 'draft' | 'simulated' | 'cancelled'; created_at: string; brief_revision?: number; ai_assisted?: boolean;
};
export type ControllerState = {
  wedding: Wedding; revision: number; input_version: string; needs_run: boolean; last_run_at: string | null;
  tasks: Assignment[]; next_action: Assignment | null;
  counts: { vendors: number; drafts: number; overdue: number; completed_steps: number };
  coordination: { vendors: Contact[]; tasks: Deliverable[]; messages: VendorMessage[] };
  activity: { id: number; kind: string; title: string; brief_revision: number; created_at: string }[];
  mode: 'simulation';
};
export type ControllerRun = { expected_revision: number; brief_revision: number; input_version: string; request_id: string };

export const agentLabels: Record<AgentRole, string> = {
  couple: 'Couple understanding', vendor_communication: 'Vendor communication',
  vendor_comparison: 'Vendor comparison', coordinator: 'Overall coordination',
};
export const statusLabels: Record<TaskStatus, string> = {
  ready: 'Ready', completed: 'Complete', blocked: 'Waiting on a step',
  needs_clarification: 'More details needed', needs_user_decision: 'Your decision', waiting_for_vendor: 'Waiting for an update',
};
