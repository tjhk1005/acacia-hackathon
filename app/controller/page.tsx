'use client';

import Link from 'next/link';
import { ProgressOverview, type NewDecision } from '@/components/progress-overview';
import { markRepliesSeen } from '@/lib/progress';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Clock3, Flower2, GitBranch, MessageCircle, RefreshCw, Sparkles, Users } from 'lucide-react';
import { briefsMatch, planningRequest, PlanningError, readLocalBrief, SESSION_STORAGE, type Session } from '@/lib/planning-api';
import type { WeddingBrief } from '@/lib/wedding';
import { agentLabels, statusLabels, type ControllerRun, type ControllerState, type CoupleDecision } from '@/lib/controller';
import css from './controller.module.css';
import { WhatsAppDesk } from '@/components/whatsapp-desk';
import { ScheduleProposalForm } from '@/components/schedule-proposal-form';
import { SCHEDULE_UPDATED } from '@/lib/schedule';

function dateLabel(value: string) {
  return new Date(value).toLocaleString('en-SG', { timeZone:'Asia/Singapore', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ControllerPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<ControllerState | null>(null);
  const [localBrief, setLocalBrief] = useState<WeddingBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false);
  const pendingRun = useRef<ControllerRun | null>(null);
  const polling = useRef(false);
  const changeEpoch = useRef(0);
  const [refreshError, setRefreshError] = useState('');
  const [contact, setContact] = useState({ name: '', category: 'catering', channel: 'whatsapp', contact: '' });
  const [reply, setReply] = useState({ vendor_id: '', availability: 'unknown', content: '' });
  const [deadline, setDeadline] = useState({ vendor_id: '', title: '', due_at: '' });

  function readDraft() {
    try { setLocalBrief(readLocalBrief(localStorage)); } catch { /* Saved server state remains usable. */ }
  }

  async function refresh(current: Session) {
    const next = await planningRequest<ControllerState>(`/api/weddings/${current.id}/controller`, current);
    setState(next); readDraft(); setRefreshError('');
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const saved = sessionStorage.getItem(SESSION_STORAGE);
        if (!saved) return;
        const current = JSON.parse(saved);
        if (typeof current.id !== 'string' || typeof current.token !== 'string') return;
        if (active) setSession(current);
        const next = await planningRequest<ControllerState>(`/api/weddings/${current.id}/controller`, current);
        if (active) { setState(next); readDraft(); }
      } catch (issue) { if (active) setError((issue as Error).message); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    async function poll() {
      if (document.visibilityState !== 'visible' || busyRef.current || polling.current) return;
      polling.current = true;
      const epoch = changeEpoch.current;
      try {
        const next = await planningRequest<ControllerState>(`/api/weddings/${session!.id}/controller`, session);
        if (active && !busyRef.current && epoch === changeEpoch.current) { setState(next); readDraft(); setRefreshError(''); }
      } catch { if (active) setRefreshError('Updates could not refresh. The last saved progress is still shown.'); }
      finally { polling.current = false; }
    }
    const timer = window.setInterval(() => void poll(), 30000);
    window.addEventListener(SCHEDULE_UPDATED, poll); window.addEventListener('focus', poll); document.addEventListener('visibilitychange', poll);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener(SCHEDULE_UPDATED, poll); window.removeEventListener('focus', poll); document.removeEventListener('visibilitychange', poll); };
  }, [session]);

  const outOfSync = !!(state && localBrief && !briefsMatch(localBrief, state.wedding.brief));
  const locked = busy || outOfSync;
  const contacts = state?.coordination.vendors ?? [];
  const activeContacts = contacts.filter(vendor => vendor.active !== false);
  const simulationContacts = activeContacts.filter(vendor => !vendor.messaging_mode || vendor.messaging_mode === 'off');
  const drafts = state?.coordination.messages.filter(message => message.status === 'draft') ?? [];
  const vendorName = (id: string) => contacts.find(vendor => vendor.id === id)?.name ?? 'Vendor';
  const canPrepare = state?.wedding.status === 'confirmed';

  useEffect(() => {
    if (!state || document.visibilityState !== 'visible') return;
    try { markRepliesSeen(state,localStorage); } catch { /* Progress works even when browser read markers cannot be saved. */ }
  },[state]);

  async function perform(action: () => Promise<void>) {
    if (busyRef.current) return;
    changeEpoch.current += 1;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (issue) {
      if (issue instanceof PlanningError && issue.status === 409 && session) {
        pendingRun.current = null;
        try { await refresh(session); } catch { /* Keep the conflict visible. */ }
        setError('Planning inputs changed. The dashboard is refreshed; review it before trying again.');
      } else { setError((issue as Error).message); }
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function run() {
    if (!session || !state || outOfSync) return;
    const pending = pendingRun.current;
    const body = pending && pending.expected_revision === state.revision && pending.input_version === state.input_version
      ? pending : { expected_revision: state.revision, brief_revision: state.wedding.revision, input_version: state.input_version, request_id: crypto.randomUUID() };
    pendingRun.current = body;
    await perform(async () => {
      setState(await planningRequest<ControllerState>(`/api/weddings/${session.id}/controller/run`, session, body));
      pendingRun.current = null;
      await refresh(session);
      setNotice('Planning steps checked. Any prepared messages are drafts for your review.');
    });
  }

  async function coordinate(path: string, body: unknown, onSuccess?: () => void) {
    if (!session || outOfSync) return;
    await perform(async () => {
      await planningRequest(`/api/weddings/${session.id}/coordination${path}`, session, body);
      onSuccess?.(); pendingRun.current = null;
      await refresh(session); setNotice('Saved. Check next steps to update the controller’s activity history.');
    });
  }

  async function createDecision(body: NewDecision): Promise<boolean> {
    if (!session || outOfSync) return false;
    let saved = false;
    await perform(async () => {
      await planningRequest(`/api/weddings/${session.id}/controller/decisions`, session, body);
      saved = true;
      await refresh(session); setNotice('Your decision reminder is saved in your planning schedule.');
    });
    return saved;
  }

  async function changeDecision(decision: CoupleDecision) {
    if (!session || outOfSync) return;
    await perform(async () => {
      await planningRequest(`/api/weddings/${session.id}/controller/decisions/${decision.id}`, session,
        {expected_revision:decision.revision,done:!decision.done}, 'PATCH');
      await refresh(session); setNotice(decision.done ? 'This decision is back on your list.' : 'Decision marked done. Your schedule is updated.');
    });
  }

  function addContact(event: FormEvent) {
    event.preventDefault();
    void coordinate('/vendors', contact, () => setContact({ ...contact, name: '', contact: '' }));
  }

  return <div className={css.shell}>
    <header className={css.header}>
      <Link href="/" className={css.brand}><Flower2 size={25} />ever after<span>.</span></Link>
      <nav aria-label="Wedding navigation"><Link href="/">Your vision</Link><Link href="/planner">Your planner</Link><Link href="/vendors">Your vendors</Link><span aria-current="page">Planning progress</span><Link href="#whatsapp">Vendor pilot</Link></nav>
    </header>
    <main className={css.main}>
      <div className={css.heading}><div><span className={css.eyebrow}><GitBranch size={14} /> KEEPING THE THREADS TOGETHER</span><h1>A little less to hold.<br /><em>A clear next step.</em></h1><p>Vendor updates, decisions and deadlines, with a clear place for each next step.</p></div>{session && <button className={css.secondary} disabled={busy} onClick={() => void perform(() => refresh(session))}><RefreshCw size={15} />Refresh saved progress</button>}</div>
      {error && <div className={css.error} role="alert">{error}</div>}
      {refreshError && <div className={css.notice} role="status">{refreshError}</div>}
      {notice && <div className={css.notice} role="status">{notice}</div>}
      {loading ? <p role="status">Opening your planning progress…</p> : !state ? <section className={css.empty}><Sparkles size={30} /><h2>One wedding, one shared plan.</h2><p>Start or reopen your planner to give the controller a saved wedding to work with.</p><Link href="/planner" className={css.primary}>Open our planner<ArrowRight size={16} /></Link>{session && <button className={css.secondary} disabled={busy} onClick={() => void perform(() => refresh(session))}>Try reopening progress</button>}</section> : <>
        <div className={css.banner}><span>{state.mode === 'mixed' ? 'LIVE & SIMULATION' : 'SIMULATION'}</span><p>The controller prepares drafts and flags decisions. Vendor search and WhatsApp outreach are shown as a piloting preview; live outreach is paused. Contacts use simulation. Bookings, payments and changed terms require your decision.</p></div>
        {outOfSync && <div className={css.notice} role="status">Your saved quiz or details differ from this plan. <Link href="/planner">Review and sync with your planner →</Link></div>}
        <ProgressOverview state={state} locked={locked} onCreate={createDecision} onChange={changeDecision} />
        <section className={css.next} aria-label="Your next planning step">
          <div><span className={css.eyebrow}>YOUR NEXT STEP</span><h2>{state.next_action?.title ?? 'The current steps are accounted for.'}</h2><p>{state.next_action?.detail ?? 'Real quotation evidence is still needed before a wedding can be called ready.'}</p>{state.next_action && <Link href={state.next_action.action_href}>Take this step<ArrowRight size={15} /></Link>}</div>
          <div className={css.runBox}><button className={css.primary} disabled={locked} onClick={() => void run()}><GitBranch size={16} />{busy ? 'Checking…' : 'Check next steps'}</button><p>{state.needs_run ? 'New inputs or draft work are ready to check.' : 'The saved plan reflects the current inputs.'}</p><small>{state.last_run_at ? `Last checked ${dateLabel(state.last_run_at)}` : 'The controller has not run yet.'}</small></div>
        </section>
        <div className={css.stats}><span><strong>{state.counts.completed_steps}</strong> recorded steps complete</span><span><strong>{state.counts.vendors}</strong> active contacts</span><span><strong>{state.counts.drafts}</strong> drafts to review</span><span><strong>{state.counts.overdue}</strong> overdue deliverables</span></div>
        <section id="planning-assignments" aria-label="Planning assignments"><div className={css.sectionHeading}><span className={css.eyebrow}>THE PLANNING TEAM</span><h2>Everyone has a part to play.</h2><p>Tasks are assigned to four logical roles. This is a rules-based workflow, with your decisions at the centre.</p></div><div className={css.assignments}>{state.tasks.map(task => <article key={task.key} className={task.status === 'completed' ? css.complete : css.assignment}><div className={css.taskTop}><span>{agentLabels[task.agent]}</span><span className={css[task.status]}>{task.status === 'completed' && <Check size={11} />}{statusLabels[task.status]}</span></div><h3>{task.title}</h3><p>{task.detail}</p>{task.depends_on.length > 0 && <small>After: {task.depends_on.map(key => state.tasks.find(item => item.key === key)?.title ?? key).join(' · ')}</small>}{task.status !== 'completed' && <Link href={task.action_href}>Review this step<ArrowRight size={13} /></Link>}</article>)}</div></section>
        <section id="vendor-desk" className={css.desk} aria-label="Vendor simulation desk"><div className={css.sectionHeading}><span className={css.eyebrow}><Users size={13} /> YOUR VENDOR DESK</span><h2>The people behind the plan.</h2><p>Use contacts you enter yourself. The fictional catering catalogue is kept separate.</p></div>
          <div className={css.contactList}>{contacts.map(vendor => <article key={vendor.id}><div><strong>{vendor.name}</strong><p>{vendor.category} · {vendor.channel}: {vendor.contact}</p><small>{vendor.active === false ? 'Excluded from this plan' : `${vendor.messaging_mode && vendor.messaging_mode !== 'off' ? 'WhatsApp availability claim' : 'Simulated availability'}: ${vendor.availability}`}</small></div><button className={css.textButton} disabled={locked} onClick={() => void coordinate(`/vendors/${vendor.id}/participation`, { active: vendor.active === false })}>{vendor.active === false ? 'Reconsider vendor' : 'Exclude from plan'}</button></article>)}</div>
          <details className={css.formPanel}><summary>Add a vendor contact</summary><form onSubmit={addContact}><div className={css.fields}><label>Vendor name<input required maxLength={200} disabled={locked} value={contact.name} onChange={event => setContact({ ...contact, name: event.target.value })} /></label><label>Category<select disabled={locked} value={contact.category} onChange={event => setContact({ ...contact, category: event.target.value })}>{['catering', 'venue', 'flowers', 'dress', 'emcee', 'accommodation'].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Channel label<select disabled={locked} value={contact.channel} onChange={event => setContact({ ...contact, channel: event.target.value })}><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option></select></label><label>Contact reference<input required maxLength={200} disabled={locked} value={contact.contact} onChange={event => setContact({ ...contact, contact: event.target.value })} placeholder="Phone or group reference for your simulation" /></label></div><button className={css.primary} disabled={locked}>Save contact<ArrowRight size={14} /></button></form></details>
          <details className={css.formPanel} id="inbox"><summary>Record a simulated vendor reply</summary><form onSubmit={event => { event.preventDefault(); if (state) void coordinate(`/vendors/${reply.vendor_id}/replies`, { content: reply.content, availability: reply.availability, brief_revision: state.wedding.revision }, () => setReply({ ...reply, content: '' })); }}><div className={css.fields}><label>Reply from<select required disabled={locked} value={reply.vendor_id} onChange={event => setReply({ ...reply, vendor_id: event.target.value })}><option value="">Choose a vendor</option>{simulationContacts.map(vendor => <option value={vendor.id} key={vendor.id}>{vendor.name}</option>)}</select></label><label>Availability annotation<select disabled={locked} value={reply.availability} onChange={event => setReply({ ...reply, availability: event.target.value })}><option value="unknown">Unknown</option><option value="available">Available for this date (simulation)</option><option value="unavailable">Unavailable for this date (simulation)</option></select></label></div><label>Exact reply<textarea required maxLength={4000} rows={3} disabled={locked} value={reply.content} onChange={event => setReply({ ...reply, content: event.target.value })} /></label><p className={css.finePrint}>Availability is your explicit annotation for {state.wedding.brief.date || 'a date still to decide'}. Text is retained as evidence; the controller does not infer a quotation from it.</p><button className={css.primary} disabled={locked || !simulationContacts.length}>Record simulated reply<Check size={14} /></button></form></details>
        </section>
        <WhatsAppDesk wedding={state.wedding} />
        <section id="drafts" aria-label="Prepared vendor messages"><div className={css.sectionHeading}><span className={css.eyebrow}><MessageCircle size={13} /> WORDS, READY FOR YOUR REVIEW</span><h2>A draft before a decision.</h2><p>Checking next steps prepares at most 20 missing enquiries or reminders per run, after you confirm the brief.</p></div>{drafts.length ? <div className={css.messages}>{drafts.map(message => <article key={message.id}><div className={css.taskTop}><strong>{vendorName(message.vendor_id)}</strong><span>Draft · {dateLabel(message.created_at)}</span></div><p>{message.content}</p>{message.source === 'whatsapp' ? <Link className={css.secondary} href="#whatsapp">Review in WhatsApp controls<ArrowRight size={14} /></Link> : <><button className={css.secondary} disabled={locked || !canPrepare} onClick={() => void coordinate(`/messages/${message.id}/approve`, {})}>Approve simulated delivery<Check size={14} /></button><small>No external message will be sent.</small></>}</article>)}</div> : <p className={css.placeholder}>No drafts waiting. Confirm the brief, add a date and contact, then check next steps.</p>}
          <details className={css.history}><summary>Recorded simulated conversations</summary>{state.coordination.messages.filter(message => message.status !== 'draft').slice(-30).reverse().map(message => <article key={message.id}><small>{vendorName(message.vendor_id)} · {message.source === 'whatsapp' ? `WhatsApp: ${message.status}` : message.direction === 'incoming' ? 'Simulated reply' : message.status === 'cancelled' ? 'Cancelled draft' : 'Simulated delivery'} · {dateLabel(message.created_at)}</small><p>{message.content}</p></article>)}</details>
        </section>
        <section id="deadlines" aria-label="Vendor deadlines"><div className={css.sectionHeading}><span className={css.eyebrow}><Clock3 size={13} /> KEEPING THE PROMISES IN VIEW</span><h2>Small tasks, clear dates.</h2></div>{state.coordination.tasks.filter(task => activeContacts.some(vendor => vendor.id === task.vendor_id)).map(task => <article className={css.deliverable} key={task.id}><div><strong>{task.title}</strong><p>{vendorName(task.vendor_id)} · due {dateLabel(task.due_at)}</p></div>{task.done ? <span><Check size={14} />Complete</span> : <button disabled={locked} className={css.secondary} onClick={() => void coordinate(`/tasks/${task.id}/complete`, {})}>Mark complete<Check size={14} /></button>}</article>)}<details className={css.formPanel}><summary>Add a vendor deliverable</summary><form onSubmit={event => { event.preventDefault(); void coordinate('/tasks', { ...deadline, due_at: new Date(String(new FormData(event.currentTarget).get('due_at'))).toISOString() }, () => setDeadline({ ...deadline, title: '', due_at: '' })); }}><div className={css.fields}><label>Responsible vendor<select required disabled={locked} value={deadline.vendor_id} onChange={event => setDeadline({ ...deadline, vendor_id: event.target.value })}><option value="">Choose a vendor</option>{activeContacts.map(vendor => <option value={vendor.id} key={vendor.id}>{vendor.name}</option>)}</select></label><label>Deliverable<input required maxLength={300} disabled={locked} value={deadline.title} onChange={event => setDeadline({ ...deadline, title: event.target.value })} /></label><label>Due in your local time<input type="datetime-local" name="due_at" required disabled={locked} value={deadline.due_at} onChange={event => setDeadline({ ...deadline, due_at: event.target.value })} /></label></div><button className={css.primary} disabled={locked || !activeContacts.length}>Save deliverable<ArrowRight size={14} /></button></form></details>{session && <ScheduleProposalForm session={session} wedding={state.wedding} tasks={state.coordination.tasks} contacts={contacts} locked={locked} onSaved={() => refresh(session)}/>}</section>
        <section className={css.activity} aria-label="Controller activity"><div className={css.sectionHeading}><span className={css.eyebrow}>A RECORD OF WHAT HAPPENED</span><h2>The plan, as it moves.</h2></div>{state.activity.length ? <ol>{state.activity.map(event => <li key={event.id}><span>{dateLabel(event.created_at)}</span><p>{event.title}</p></li>)}</ol> : <p className={css.placeholder}>Check next steps to save the first controller activity.</p>}</section>
      </>}
      {!loading && !state && <WhatsAppDesk/>}
    </main>
  </div>;
}
