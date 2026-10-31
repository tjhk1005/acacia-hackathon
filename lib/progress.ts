import type { ControllerState } from './controller';

export type ScheduleEntry = {
  id: string; title: string; owner: string; due_at: string | null; done: boolean;
  href: string; phase: 'completed' | 'overdue' | 'due_soon' | 'scheduled' | 'unscheduled';
};
export function deadlinePhase(due: string | null, done: boolean, now = Date.now()): ScheduleEntry['phase'] {
  if (done) return 'completed';
  if (!due) return 'unscheduled';
  const difference = new Date(due).getTime() - now;
  return difference <= 0 ? 'overdue' : difference <= 72 * 60 * 60 * 1000 ? 'due_soon' : 'scheduled';
}

export function progressSchedule(state: ControllerState, now = Date.now()): ScheduleEntry[] {
  const decisions: ScheduleEntry[] = (state.decisions ?? []).map(item => ({
    id: `decision:${item.id}`, title: item.title, owner: 'The two of you', due_at: item.due_at,
    done: item.done, href: '#your-decisions', phase: deadlinePhase(item.due_at, item.done, now),
  }));
  const vendors: ScheduleEntry[] = state.coordination.tasks.flatMap(item => {
    const vendor = state.coordination.vendors.find(vendor => vendor.id === item.vendor_id && vendor.active !== false);
    return vendor ? [{id:`vendor:${item.id}`, title:item.title, owner:vendor.name, due_at:item.due_at,
      done:item.done, href:'#deadlines', phase:deadlinePhase(item.due_at,item.done,now)}] : [];
  });
  return [...decisions, ...vendors].sort((a,b) => Number(a.done) - Number(b.done) ||
    (a.due_at ? new Date(a.due_at).getTime() : Infinity) - (b.due_at ? new Date(b.due_at).getTime() : Infinity) || a.title.localeCompare(b.title));
}

export function progressUpdates(state: ControllerState) {
  const replies = state.coordination.messages.filter(item => item.direction === 'incoming').map(item => {
    const vendor = state.coordination.vendors.find(vendor => vendor.id === item.vendor_id);
    return {id:`reply:${item.id}`, title:`${vendor?.name ?? 'A vendor'} replied`, detail:item.content,
      created_at:item.created_at, label:'Simulated vendor reply', href:'#inbox'};
  });
  const events = state.activity.map(item => ({id:`activity:${item.id}`, title:item.title, detail:'',
    created_at:item.created_at, label:item.kind.startsWith('decision_') ? 'Your planning tasks' : 'Planning update', href:item.kind.startsWith('decision_') ? '#your-decisions' : item.kind==='draft_prepared' ? '#drafts' : '#planning-assignments'}));
  return [...replies,...events].sort((a,b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)).slice(0,10);
}

export function unreadReplies(state: ControllerState, storage: Pick<Storage,'getItem'>): number {
  let seen: unknown = [];
  try { seen=JSON.parse(storage.getItem(`ever-after-seen-replies:${state.wedding.id}`) ?? '[]'); } catch { /* A damaged read marker must not hide updates. */ }
  const ids=new Set(Array.isArray(seen)?seen:[]);
  return state.coordination.messages.filter(message=>message.direction==='incoming'&&!ids.has(message.id)).length;
}

export function markRepliesSeen(state: ControllerState, storage: Pick<Storage,'setItem'>): void {
  storage.setItem(`ever-after-seen-replies:${state.wedding.id}`,JSON.stringify(state.coordination.messages.filter(message=>message.direction==='incoming').map(message=>message.id)));
}
