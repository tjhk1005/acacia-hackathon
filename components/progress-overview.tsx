'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Bell, CalendarDays, Check, Plus } from 'lucide-react';
import type { ControllerState, CoupleDecision } from '@/lib/controller';
import { progressSchedule, progressUpdates } from '@/lib/progress';
import css from '@/app/controller/controller.module.css';

export type NewDecision = { request_id: string; title: string; detail: string; due_at: string | null };
const phases = { overdue:'Overdue', due_soon:'Due within 3 days', scheduled:'Upcoming', unscheduled:'Choose a time', completed:'Complete' };
function dateLabel(value: string) {
  return new Date(value).toLocaleString('en-SG', {timeZone:'Asia/Singapore',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
}

export function ProgressOverview({ state, locked, onCreate, onChange }: {
  state: ControllerState; locked: boolean;
  onCreate: (body: NewDecision) => Promise<boolean>;
  onChange: (decision: CoupleDecision) => Promise<void>;
}) {
  const [draft, setDraft] = useState({ title:'', detail:'', due_at:'' });
  const [error, setError] = useState('');
  const [showComplete, setShowComplete] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState('all');
  const request = useRef<string | null>(null);
  const updates = progressUpdates(state);
  const attention = state.tasks.filter(task => task.status === 'needs_user_decision' || task.status === 'needs_clarification');
  const decisions = [...(state.decisions ?? [])].sort((a,b) => Number(a.done)-Number(b.done) || (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'));
  const schedule = progressSchedule(state).filter(item => (showComplete || !item.done) &&
    (scheduleFilter === 'all' || (scheduleFilter === 'couple' ? item.id.startsWith('decision:') : item.id.startsWith('vendor:'))));

  function edit(key: keyof typeof draft, value: string) {
    setDraft(current=>({...current,[key]:value})); request.current=null; setError('');
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    const form=event.currentTarget as HTMLFormElement;
    if (!draft.title.trim()) { setError('Give this decision a name.'); return; }
    const dueInput=String(new FormData(form).get('due_at') ?? '');
    const due = dueInput ? new Date(dueInput) : null;
    if (due && !Number.isFinite(due.getTime())) { setError('Choose a valid date and time.'); return; }
    request.current ??= crypto.randomUUID();
    if (await onCreate({request_id:request.current,title:draft.title.trim(),detail:draft.detail,due_at:due?.toISOString() ?? null})) {
      form.reset(); setDraft({title:'',detail:'',due_at:''}); request.current=null; setError('');
    }
  }

  return <>
    <nav className={css.progressNav} aria-label="Progress sections"><a href="#updates">Latest updates</a><a href="#your-decisions">Your decisions</a><a href="#schedule">Your schedule</a><a href="#vendor-desk">Vendor desk</a></nav>
    <div className={css.overviewGrid}>
      <section id="updates" className={css.overviewPanel} aria-label="Latest planning updates"><div className={css.panelHeading}><Bell size={18}/><h2>What’s new</h2></div><p className={css.finePrint}>Vendor replies and recorded progress appear here. Updates refresh while this page is open.</p>
        {updates.length ? <ol className={css.updateList}>{updates.map(update=><li key={update.id}><div><span>{update.label}</span><time dateTime={update.created_at}>{dateLabel(update.created_at)}</time></div><h3>{update.title}</h3>{update.detail && <><p>{update.detail.slice(0,240)}{update.detail.length>240?'…':''}</p>{update.detail.length>240&&<details><summary>Read original reply</summary><p>{update.detail}</p></details>}</>}<a href={update.href}>View details <ArrowRight size={12}/></a></li>)}</ol> : <p className={css.placeholder}>No recorded updates yet. Vendor replies will appear as they’re recorded in your vendor desk.</p>}
      </section>
      <section className={css.overviewPanel} aria-label="Tasks needing your attention"><div className={css.panelHeading}><Check size={18}/><h2>A little input from you</h2><span className={css.attentionCount}>{attention.length}</span></div><p className={css.finePrint}>Decisions, missing details and approaching deadlines that need your attention.</p>
        {attention.length ? <ul className={css.attentionList}>{attention.slice(0,6).map(task=><li key={task.key}><h3>{task.title}</h3><p>{task.detail}</p><Link href={task.action_href}>Take this step <ArrowRight size={12}/></Link></li>)}</ul> : <p className={css.placeholder}>No decisions need your attention right now. Your remaining steps and vendor deadlines are below.</p>}
        {attention.length>6&&<a className={css.textButton} href="#planning-assignments">See all {attention.length} tasks</a>}
      </section>
    </div>
    <section id="schedule" aria-label="Wedding progress schedule"><div className={css.sectionHeading}><span className={css.eyebrow}><CalendarDays size={14}/> YOUR PLANNING SCHEDULE</span><h2>What happens next, and when.</h2><p>Your decisions and active vendor deadlines, together. Times shown in Singapore time.</p></div>
      <div className={css.scheduleTools}><label>Show<select value={scheduleFilter} onChange={event=>setScheduleFilter(event.target.value)}><option value="all">Everyone’s tasks</option><option value="couple">Our decisions</option><option value="vendors">Vendor deliverables</option></select></label><label><input type="checkbox" checked={showComplete} onChange={event=>setShowComplete(event.target.checked)}/>Include completed tasks</label></div>
      {schedule.length ? <ol className={css.scheduleList}>{schedule.map(item=><li key={item.id} className={css.scheduleRow}><div className={css.scheduleDate}>{item.due_at?<time dateTime={item.due_at}>{dateLabel(item.due_at)}</time>:<span>No date set</span>}<span className={css[item.phase==='overdue'?'overdue':item.phase==='due_soon'?'dueSoon':'scheduleStatus']}>{phases[item.phase]}</span></div><div><h3>{item.title}</h3><p>{item.owner}</p></div><a href={item.href}>Open task <ArrowRight size={13}/></a></li>)}</ol> : <p className={css.placeholder}>No tasks in this view. Add a decision below or a deadline in the vendor desk.</p>}
    </section>
    <section id="your-decisions" aria-label="Your decision reminders"><div className={css.sectionHeading}><span className={css.eyebrow}>A FEW THINGS ONLY YOU CAN DECIDE</span><h2>Your decisions, with a little nudge.</h2><p>Add reminders such as choosing a menu or reviewing a florist’s proposal. Changes to your wedding details can be made in <Link href="/planner">your planner</Link>.</p></div>
      <div className={css.decisionList}>{decisions.map(decision=><article key={decision.id}><div><h3>{decision.title}</h3>{decision.detail&&<p>{decision.detail}</p>}<small>{decision.done?'Completed by you':decision.due_at?`Due ${dateLabel(decision.due_at)}`:'No due date set'}</small></div><button className={css.secondary} disabled={locked} onClick={()=>void onChange(decision)} aria-label={`${decision.done?'Reopen':'Complete'} decision: ${decision.title}`}>{decision.done?'Reopen task':<><Check size={14}/>Mark done</>}</button></article>)}</div>
      <details className={css.formPanel}><summary><Plus size={14}/> Add a decision reminder</summary><form onSubmit={event=>void add(event)}><div className={css.fields}><label>What do you need to decide?<input required maxLength={300} disabled={locked} placeholder="e.g. Choose our dinner menu" value={draft.title} onChange={event=>edit('title',event.target.value)}/></label><label>Due date and time (optional, your local time)<input type="datetime-local" name="due_at" disabled={locked} defaultValue="" onChange={event=>edit('due_at',event.target.value)}/></label></div><label>A note for later (optional)<textarea rows={2} maxLength={2000} disabled={locked} placeholder="Anything you want to remember before deciding" value={draft.detail} onChange={event=>edit('detail',event.target.value)}/></label>{error&&<p role="alert" className={css.error}>{error}</p>}<button className={css.primary} disabled={locked}>Save decision reminder <ArrowRight size={14}/></button></form></details>
    </section>
  </>;
}
