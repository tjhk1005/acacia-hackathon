'use client';

import Link from 'next/link';
import { ProgressNotice } from '@/components/progress-notice';
import { PersonalitySummary } from '@/components/personality-summary';
import { emptyBrief } from '@/lib/wedding';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Check, Flower2, Heart, Pencil, RefreshCw, Sparkles } from 'lucide-react';
import { getDirection, styles, type WeddingBrief } from '@/lib/wedding';
import { readLocalBrief, persistLocalBrief, SESSION_STORAGE, PlanningError, briefsMatch, planningRequest, type ChatTurn, type Message, type Session, type Wedding } from '@/lib/planning-api';
import css from './planner.module.css';

const blankBrief: WeddingBrief = emptyBrief;

export default function PlannerPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [wedding, setWedding] = useState<Wedding | null>(null);
  const [draft, setDraft] = useState<WeddingBrief | null>(null);
  const [localBrief, setLocalBrief] = useState<WeddingBrief | null>(null);
  const [incomingBrief, setIncomingBrief] = useState<WeddingBrief | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pendingTurn, setPendingTurn] = useState<ChatTurn | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [changed, setChanged] = useState<string[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  function accept(next: Wedding, persist = true) {
    setWedding(next);
    if (!persist) return;
    try { persistLocalBrief(localStorage, next.brief); }
    catch { setNotice('Your brief is saved with your planner, but this browser couldn’t keep a local copy.'); }
  }

  async function refresh(current: Session, persist = true) {
    const [state, history] = await Promise.all([
      planningRequest<{ wedding: Wedding }>(`/api/weddings/${current.id}`, current),
      planningRequest<{ messages: Message[] }>(`/api/weddings/${current.id}/messages`, current),
    ]);
    accept(state.wedding, persist); setMessages(history.messages);
  }

  useEffect(() => {
    let active = true;
    async function restore() {
      let current: Session | null = null;
      let imported: WeddingBrief | null = null;
      try {
        if (active) { imported = readLocalBrief(localStorage); setLocalBrief(imported); }
        const saved = sessionStorage.getItem(SESSION_STORAGE);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.id === 'string' && typeof parsed.token === 'string') current = parsed;
        }
      } catch { if (active) setNotice('Browser storage isn’t available. Keep this tab open to retain your planning session.'); }
      if (active && current) setSession(current);
      try {
        const health = await planningRequest<{ ai_configured: boolean }>('/health');
        if (active) setAiReady(health.ai_configured);
        if (current && active) {
          setSession(current);
          const [state, history] = await Promise.all([
            planningRequest<{ wedding: Wedding }>(`/api/weddings/${current.id}`, current),
            planningRequest<{ messages: Message[] }>(`/api/weddings/${current.id}/messages`, current),
          ]);
          if (active) {
            const differs = imported && !briefsMatch(imported, state.wedding.brief);
            if (differs) setIncomingBrief(imported);
            accept(state.wedding, !differs); setMessages(history.messages);
          }
        }
      } catch (issue) { if (active) setError((issue as Error).message); }
      finally { if (active) setLoading(false); }
    }
    void restore();
    return () => { active = false; };
  }, []);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy]);

  async function perform(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (issue) {
      if (issue instanceof PlanningError && issue.status === 409 && session) {
        setPendingTurn(null);
        try { await refresh(session, !incomingBrief); } catch { /* Keep the original conflict message. */ }
      }
      setError((issue as Error).message);
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function start(useSaved: boolean) {
    await perform(async () => {
      const created = await planningRequest<{ wedding: Wedding; access_token: string }>('/api/weddings', null, { brief: useSaved && localBrief ? localBrief : blankBrief });
      const current = { id: created.wedding.id, token: created.access_token };
      setSession(current); accept(created.wedding); setMessages([]); setQuestions([]); setPendingTurn(null);
      try { sessionStorage.setItem(SESSION_STORAGE, JSON.stringify(current)); }
      catch { setNotice('Keep this tab open. This browser couldn’t save your planning session.'); }
    });
  }

  async function send() {
    if (!session || !wedding || !input.trim() || draft || incomingBrief) return;
    const turn = pendingTurn && pendingTurn.message === input.trim() ? pendingTurn : { message: input.trim(), expected_revision: wedding.revision, request_id: crypto.randomUUID() };
    setPendingTurn(turn);
    await perform(async () => {
      const result = await planningRequest<{ wedding: Wedding; reply: string; questions: string[]; changed_fields: string[] }>(`/api/weddings/${session.id}/chat`, session, turn);
      accept(result.wedding); setQuestions(result.questions); setChanged(result.changed_fields);
      setInput(''); setPendingTurn(null);
      setMessages(current => [...current, { role: 'user', content: turn.message, created_at: '' }, { role: 'assistant', content: result.reply, created_at: '' }]);
      // A replayed chat response may describe an older revision. Refresh before allowing more edits.
      try { await refresh(session); }
      catch { setNotice('Your message was saved. Refresh the conversation before making more changes if another tab is editing.'); }
    });
  }

  async function saveDraft() {
    if (!session || !wedding || !draft) return;
    await perform(async () => {
      const result = await planningRequest<{ wedding: Wedding }>(`/api/weddings/${session.id}`, session, { expected_revision: wedding.revision, brief: draft }, 'PATCH');
      accept(result.wedding); setDraft(null); setChanged([]); setPendingTurn(null); setNotice('Your changes are saved.');
    });
  }

  async function confirm() {
    if (!session || !wedding) return;
    await perform(async () => {
      const result = await planningRequest<{ wedding: Wedding }>(`/api/weddings/${session.id}/confirm`, session, { expected_revision: wedding.revision });
      accept(result.wedding); setNotice('Your brief is confirmed. You can still change it later.');
    });
  }

  const brief = wedding?.brief;
  const selected = styles.find(item => item.id === brief?.style);
  const direction = brief ? getDirection(brief) : undefined;
  const visibleQuestions = questions.filter(question => !messages.at(-1)?.content.includes(question));

  return <div className={css.shell}>
    <header className={css.header}><Link href="/" className={css.brand}><Flower2 size={25} />ever after<span>.</span></Link><nav className={css.pageNav}><Link href="/" className={css.back}><ArrowLeft size={15} />Your quiz & vision</Link><Link href="/vendors" className={css.back}>Your vendors<ArrowRight size={15} /></Link><ProgressNotice className={css.back} /></nav></header>
    <main className={css.main}>
      <div className={css.heading}><span className={css.eyebrow}><Sparkles size={14} /> A LITTLE CLARITY, TOGETHER</span><h1>Let’s find <em>your kind of day.</em></h1><p>Talk through what matters. Your planner keeps the details beside you, ready to refine.</p></div>
      {notice && <div className={css.notice} role="status">{notice}</div>}
      {error && <div className={css.error} role="alert">{error}</div>}
      {incomingBrief && wedding && session && <div className={css.notice} role="status">Your saved quiz or planning details differ from this conversation. Choose which version to keep before continuing.
        <details><summary>Review latest quiz & details</summary><PersonalitySummary profile={incomingBrief.personality} /><p>{incomingBrief.names || 'Names undecided'} · {incomingBrief.guests ? `${incomingBrief.guests} guests` : 'Guest count undecided'} · {incomingBrief.location || 'Location undecided'} · {incomingBrief.budget ? `S$${incomingBrief.budget} overall budget` : 'Budget undecided'}</p><p>{incomingBrief.notes}</p></details>
        <div className={css.syncActions}><button className={css.textButton} disabled={busy} onClick={() => void perform(async () => {
          const result = await planningRequest<{ wedding: Wedding }>(`/api/weddings/${session.id}`, session, { expected_revision: wedding.revision, brief: incomingBrief }, 'PATCH');
          accept(result.wedding); setIncomingBrief(null); setQuestions([]); setChanged([]); setPendingTurn(null); setNotice('Your latest quiz choices and planning details are now part of this conversation.');
        })}>Use latest quiz & details</button><button className={css.textButton} disabled={busy} onClick={() => { accept(wedding); setIncomingBrief(null); }}>Keep this conversation’s brief</button></div>
      </div>}
      {loading ? <p role="status">Opening your wedding space…</p> : !wedding ? <section className={css.welcome}>
        <span className={css.mark}><Heart size={25} /></span><h2>A conversation, with room to explore.</h2>
        <p>{localBrief ? `We can bring ${localBrief.names || 'your'} saved wedding vision into this conversation, including every feeling, world, colour story and signature you kept.` : 'Start with what you know—even if it’s just a feeling. We’ll build your brief as you talk.'}</p>
        <p className={css.small}>Starting saves your brief with your planner. Chat shares your brief and recent conversation with our AI service when connected. No vendors are contacted.</p>
        <button className={css.primary} disabled={busy} onClick={() => void start(!!localBrief)}>{busy ? 'Opening…' : localBrief ? 'Continue with our wedding vision' : 'Start our conversation'}<Sparkles size={16} /></button>
        {localBrief && <button className={css.textButton} disabled={busy} onClick={() => void start(false)}>Start with a blank brief instead</button>}
        {session && <button className={css.textButton} disabled={busy} onClick={() => void perform(() => refresh(session))}>Try reopening our conversation</button>}
      </section> : <div className={css.grid}>
        <section className={css.chat} aria-label="Conversation with your wedding planner">
          <div className={css.chatTitle}><span className={css.mark}><Sparkles size={19} /></span><div><h2>Your wedding planner</h2><p>One conversation. A clearer picture.</p></div><button className={css.iconButton} aria-label="Refresh conversation" disabled={busy || !!draft || !!incomingBrief} onClick={() => session && void perform(() => refresh(session))}><RefreshCw size={17} /></button></div>
          {aiReady === false && <p className={css.connection} role="status">Your AI planner isn’t connected yet. You can still edit and save your brief beside this conversation.</p>}
          <div className={css.messages} role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions">
            <article className={css.assistant}><span className={css.speaker}>YOUR PLANNER</span><p>{brief?.personality.complete ? 'Your wedding personality is here with us—all the feelings, worlds and details you kept. What would you like to explore or work out next?' : brief?.names ? `Hello ${brief.names}. What would make this wedding feel like you? Tell me what you love, what you’re unsure about, or one thing you’d like to change.` : 'Welcome, you two. Start with a feeling, or bring your saved personality quiz. We can work out practical details when you’re ready.'}</p></article>
            {messages.map((message, index) => <article key={`${message.created_at}-${index}`} className={message.role === 'user' ? css.user : css.assistant}><span className={css.speaker}>{message.role === 'user' ? 'THE TWO OF YOU' : 'YOUR PLANNER'}</span><p>{message.content}</p></article>)}
            {visibleQuestions.length > 0 && <div className={css.questions}><span>Something to think about</span>{visibleQuestions.map(question => <p key={question}>{question}</p>)}</div>}
            {busy && <p className={css.thinking} role="status">Taking care of the details…</p>}<div ref={end} />
          </div>
          {!messages.length && <div className={css.starters}>{['We want an intimate wedding with great food.', 'Help us work out our priorities.', 'We need to plan around family traditions.'].map(text => <button key={text} disabled={busy || !!draft || !!incomingBrief} onClick={() => { setInput(text); setPendingTurn(null); }}>{text}</button>)}</div>}
          <form className={css.composer} onSubmit={event => { event.preventDefault(); void send(); }}>
            <label htmlFor="planner-message" className="sr-only">Message your wedding planner</label><textarea id="planner-message" placeholder="Tell us what you’re imagining…" value={input} maxLength={8000} rows={3} disabled={busy || !!draft || !!incomingBrief} onChange={event => { setInput(event.target.value); if (event.target.value.trim() !== pendingTurn?.message) setPendingTurn(null); }} />
            <div><span>{draft ? 'Save or cancel your brief edits to continue chatting.' : 'Your brief updates as you talk. You have the final say.'}</span><button type="submit" className={css.send} disabled={busy || !!draft || !!incomingBrief || !input.trim() || aiReady === false} aria-label={pendingTurn ? 'Retry message' : 'Send message'}>{pendingTurn ? <RefreshCw size={17} /> : <ArrowUp size={19} />}</button></div>
          </form>
        </section>
        <aside className={css.brief} aria-label="Your saved wedding brief">
          <div className={css.briefTitle}><span className={css.eyebrow}>YOUR WEDDING, TAKING SHAPE</span><span className={wedding.status === 'confirmed' ? css.confirmed : css.draft}>{wedding.status === 'confirmed' ? 'Confirmed' : 'Draft'}</span></div>
          <h2>The details that matter.</h2><PersonalitySummary profile={brief?.personality} /><p className={css.small}>Saved as you go. Review anything your planner adds.</p>
          {changed.length > 0 && <p className={css.updated} role="status">Updated: {changed.map(key => key === 'guests' ? 'guest count' : key === 'flexibleDate' ? 'date flexibility' : key).join(', ')}.</p>}
          {draft ? <form className={css.editForm} onSubmit={event => { event.preventDefault(); void saveDraft(); }}>
            {(['names', 'location', 'guests', 'budget', 'date'] as const).map(key => <label key={key}>{({ names: 'Your names', location: 'Location', guests: 'Guests', budget: 'Total wedding budget (S$)', date: 'Wedding date' })[key]}<input type={key === 'date' ? 'date' : key === 'guests' || key === 'budget' ? 'number' : 'text'} min={key === 'guests' || key === 'budget' ? '1' : undefined} step={key === 'budget' ? '0.01' : undefined} value={draft[key]} disabled={busy} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
            <label className={css.checkbox}><input type="checkbox" checked={draft.flexibleDate} disabled={busy} onChange={event => setDraft({ ...draft, flexibleDate: event.target.checked })} />Our date is flexible</label>
            <label>Requirements and notes<textarea rows={4} maxLength={8000} disabled={busy} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
            <button className={css.primary} disabled={busy}>Save changes<Check size={16} /></button><button type="button" className={css.textButton} disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
          </form> : <>
            <dl>{[['The two of you', brief?.names], ['When', brief?.date ? `${brief.date}${brief.flexibleDate ? ' · flexible' : ''}` : 'Still deciding'], ['Where', brief?.location], ['Your people', brief?.guests ? `${brief.guests} guests` : ''], ['Overall budget', wedding.budget_summary.total ? `S$${Number(wedding.budget_summary.total).toLocaleString('en-SG')}` : ''], ...(selected ? [['Earlier setting', selected.title]] : []), ...(direction ? [['Earlier direction', direction.title]] : [])].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Still exploring'}</dd></div>)}</dl>
            {!!brief?.priorities.length && <section className={css.notes}><h3>Your priorities</h3><div className={css.tags}>{brief.priorities.map(item => <span key={item}>{item}</span>)}</div></section>}
            {brief?.keywords && <section className={css.notes}><h3>The feeling</h3><p>{brief.keywords}</p></section>}
            {brief && Object.values(brief.decor).some(Boolean) && <section className={css.notes}><h3>Your decor</h3>{Object.entries(brief.decor).filter(([, value]) => value).map(([key, value]) => <p key={key}><strong>{key}:</strong> {value}</p>)}</section>}
            {brief?.notes && <section className={css.notes}><h3>Requirements and little things</h3><p>{brief.notes}</p></section>}
            <button className={css.editButton} disabled={busy || !!incomingBrief} onClick={() => { setDraft(structuredClone(wedding.brief)); setError(''); }}><Pencil size={14} />Edit these details</button>
            <button className={css.primary} disabled={busy || !!incomingBrief || wedding.missing_fields.length > 0 || wedding.status === 'confirmed'} onClick={() => void confirm()}>{wedding.status === 'confirmed' ? 'Brief confirmed' : 'Confirm our brief'}<Check size={16} /></button>
            {!!wedding.missing_fields.length && <p className={css.small}>Still to explore: {wedding.missing_fields.map(key => key === 'guests' ? 'guest count' : key === 'budget' ? 'overall budget' : key).join(', ')}.</p>}
          </>}
          <p className={css.footnote}>Changes after confirmation return the brief to draft. No enquiries or bookings are made here.</p>
        </aside>
      </div>}
    </main>
  </div>;
}
