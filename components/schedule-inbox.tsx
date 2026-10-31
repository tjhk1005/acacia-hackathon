'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Check, RefreshCw, X } from 'lucide-react';
import { planningRequest, PlanningError, SESSION_STORAGE, type Session } from '@/lib/planning-api';
import { SCHEDULE_UPDATED, type ScheduleInboxState, type ScheduleNotification } from '@/lib/schedule';
import css from './schedule-inbox.module.css';

function date(value: string) {
  return new Date(value).toLocaleString('en-SG', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
}

export function ScheduleInbox() {
  const [session,setSession]=useState<Session|null>(null);
  const [state,setState]=useState<ScheduleInboxState|null>(null);
  const [open,setOpen]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [offline,setOffline]=useState(false);
  const activeSession=useRef<Session|null>(null);
  const busyRef=useRef(false);

  useEffect(()=>{
    let active=true, loading=false, announced='';
    async function load() {
      if(loading||busyRef.current||document.visibilityState==='hidden')return;
      let current:Session|null=null;
      try {
        const saved=JSON.parse(sessionStorage.getItem(SESSION_STORAGE)??'null');
        if(typeof saved?.id==='string'&&typeof saved?.token==='string')current=saved;
      } catch {/* An absent or damaged session is handled by the planner. */}
      if(!current){activeSession.current=null;announced='';if(active){setSession(null);setState(null);setOpen(false);}return;}
      if(activeSession.current?.id!==current.id||activeSession.current?.token!==current.token){
        activeSession.current=current;
        if(active){setSession(current);setState(null);setError('');setNotice('');}
      }
      current=activeSession.current!;
      loading=true;
      try {
        const next=await planningRequest<ScheduleInboxState>(`/api/weddings/${current.id}/schedule`,current);
        if(active&&activeSession.current===current){
          setState(next);setOffline(false);
          if(announced!==current.id){announced=current.id;if(next.unread_count||next.pending_count)setOpen(true);}
        }
      }catch{
        if(active)setOffline(true);
      }finally{loading=false;}
    }
    const wake=()=>void load();
    void load();
    const timer=setInterval(wake,10000);
    window.addEventListener('online',wake);window.addEventListener('focus',wake);
    window.addEventListener(SCHEDULE_UPDATED,wake);document.addEventListener('visibilitychange',wake);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('online',wake);window.removeEventListener('focus',wake);window.removeEventListener(SCHEDULE_UPDATED,wake);document.removeEventListener('visibilitychange',wake);};
  },[]);

  async function perform(action:(current:Session)=>Promise<ScheduleInboxState>,success:string) {
    const current=activeSession.current;
    if(!current||busyRef.current)return;
    busyRef.current=true;setBusy(true);setError('');setNotice('');
    try {
      const next=await action(current);
      if(activeSession.current===current){setState(next);setOffline(false);setNotice(success);}
      window.dispatchEvent(new Event(SCHEDULE_UPDATED));
    }catch(issue){
      if(issue instanceof PlanningError&&issue.status===409){
        setError('This proposal changed or is no longer current. The inbox has refreshed; review the latest schedule.');
        try{setState(await planningRequest<ScheduleInboxState>(`/api/weddings/${current.id}/schedule`,current));}catch{/* Preserve the conflict. */}
      }else setError((issue as Error).message);
    }finally{busyRef.current=false;setBusy(false);}
  }

  function decide(notification:ScheduleNotification,decision:'approve'|'reject') {
    const change=notification.change!;
    return perform(current=>planningRequest(`/api/weddings/${current.id}/schedule/changes/${change.id}/${decision}`,current,{
      brief_revision:change.brief_revision,expected_task_revision:change.before.revision,
    }),decision==='approve'?'Approved. Your planner now uses the new schedule.':'Rejected. The current schedule is unchanged.');
  }

  if(!session)return null;
  return <aside className={css.root} aria-label="Schedule notifications">
    <div role="status" aria-live="polite" className={css.srOnly}>{state?`${state.unread_count} unread schedule updates. ${state.pending_count} changes awaiting approval.`:'Checking schedule updates.'}</div>
    <button type="button" className={css.bell} aria-expanded={open} aria-controls="schedule-inbox" onClick={()=>setOpen(value=>!value)}>
      <Bell size={17}/>Updates{state&&state.unread_count>0&&<span className={css.badge}>{state.unread_count}</span>}
      {state&&state.pending_count>0&&<span>{state.pending_count} awaiting approval</span>}
    </button>
    {open&&<section id="schedule-inbox" className={css.panel} aria-label="Your schedule updates">
      <div className={css.heading}><div><small>YOUR PLAN, KEPT IN VIEW</small><h2>Updates & approvals</h2></div><button type="button" aria-label="Close schedule updates" className={css.icon} onClick={()=>setOpen(false)}><X size={19}/></button></div>
      <p className={css.intro}>Changes wait here while you’re away. Proposed times take effect only after you approve them.</p>
      {state&&<p className={css.summary}>{state.unread_count} unread · {state.pending_count} awaiting approval</p>}
      {offline&&<p role="status" className={css.warning}>Updates could not refresh. Reconnecting when you return online; decisions remain saved.</p>}
      {error&&<p role="alert" className={css.warning}>{error}</p>}{notice&&<p role="status" className={css.notice}>{notice}</p>}
      <div className={css.tools}><button type="button" disabled={busy} onClick={()=>void perform(current=>planningRequest(`/api/weddings/${current.id}/schedule`,current),'Updates refreshed.')}><RefreshCw size={13}/>Refresh</button>
        <button type="button" disabled={busy||!state?.notifications.some(item=>!item.read_at)} onClick={()=>void perform(current=>planningRequest(`/api/weddings/${current.id}/schedule/read`,current,{ids:state!.notifications.filter(item=>!item.read_at).map(item=>item.id)}),'Displayed updates marked as read. Pending changes still need your decision.')}><Check size={13}/>Mark displayed updates as read</button></div>
      {!state?<p>Loading your saved updates…</p>:state.notifications.length===0?<p className={css.empty}>You’re up to date. Schedule updates will appear here.</p>:<ol className={css.list}>{state.notifications.map(item=><li key={item.id} className={!item.read_at?css.unread:undefined}>
        <div className={css.row}><strong>{item.title}</strong>{!item.read_at&&<span>New</span>}</div><time dateTime={item.created_at}>{date(item.created_at)}</time>
        <p>{item.detail}</p>
        {item.change&&<><dl className={css.comparison}><div><dt>Current when proposed</dt><dd>{item.change.before.title}<br/>{date(item.change.before.due_at)}</dd></div><div><dt>Proposed</dt><dd>{item.change.after.title}<br/>{date(item.change.after.due_at)}</dd></div></dl><p><strong>Reason:</strong> {item.change.reason}</p>
          {item.change.status==='pending'?<div className={css.actions}><button type="button" className={css.approve} disabled={busy||offline} onClick={()=>void decide(item,'approve')}>Approve schedule change<Check size={14}/></button><button type="button" disabled={busy||offline} onClick={()=>void decide(item,'reject')}>Reject</button></div>:<p className={css.result}>{item.change.status==='stale'?'Out of date — a fresh proposal is needed.':item.change.status==='approved'?'Approved':'Rejected'}</p>}
        </>}
        {item.kind==='vendor_review'&&<a href="/controller#whatsapp">Review vendor conversation →</a>}
      </li>)}</ol>}
      <p className={css.footer}>Approval updates your planner. It does not send a vendor message, accept terms or authorise a payment. Times use your device’s time zone.</p>
    </section>}
  </aside>;
}
