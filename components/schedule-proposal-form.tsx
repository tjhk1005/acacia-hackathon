'use client';

import { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { planningRequest, type Session, type Wedding } from '@/lib/planning-api';
import type { Contact, Deliverable } from '@/lib/controller';
import { SCHEDULE_UPDATED } from '@/lib/schedule';
import css from '@/app/controller/controller.module.css';

function localTime(value:string) {
  const date=new Date(value);
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}

export function ScheduleProposalForm({session,wedding,tasks,contacts,locked,onSaved}:{
  session:Session; wedding:Wedding; tasks:Deliverable[]; contacts:Contact[]; locked:boolean; onSaved:()=>Promise<void>;
}) {
  const [draft,setDraft]=useState({task_id:'',title:'',due_at:'',reason:''});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const busyRef=useRef(false);
  const retry=useRef<{key:string;id:string}|null>(null);
  const available=tasks.filter(task=>!task.done&&contacts.some(vendor=>vendor.id===task.vendor_id&&vendor.active!==false));
  const selected=available.find(task=>task.id===draft.task_id);
  return <details className={css.formPanel}><summary>Propose a schedule change for approval</summary>
    <p className={css.finePrint}>Keep the current deadline while a new time is reviewed. Proposals appear in Updates & approvals on every page, including when the couple returns.</p>
    {error&&<p className={css.error} role="alert">{error}</p>}{notice&&<p className={css.notice} role="status">{notice}</p>}
    <form onSubmit={event=>{event.preventDefault();if(!selected||busyRef.current||locked)return;busyRef.current=true;setBusy(true);setError('');setNotice('');
      void(async()=>{
        try {
          const payload={task_id:selected.id,title:draft.title,due_at:new Date(draft.due_at).toISOString(),reason:draft.reason,brief_revision:wedding.revision,expected_task_revision:selected.revision??0};
          const key=JSON.stringify(payload);
          if(retry.current?.key!==key)retry.current={key,id:crypto.randomUUID()};
          await planningRequest(`/api/weddings/${session.id}/schedule/changes`,session,{...payload,request_id:retry.current!.id});
          retry.current=null;setDraft({task_id:'',title:'',due_at:'',reason:''});
          setNotice('Proposal saved. The current schedule stays in place until the couple approves it in Updates & approvals.');
          window.dispatchEvent(new Event(SCHEDULE_UPDATED));await onSaved();
        }catch(issue){setError((issue as Error).message);await onSaved().catch(()=>{});}
        finally{busyRef.current=false;setBusy(false);}
      })();
    }}><div className={css.fields}>
      <label>Deliverable to change<select required disabled={locked||busy} value={draft.task_id} onChange={event=>{
        const task=available.find(item=>item.id===event.target.value);
        setDraft({...draft,task_id:task?.id??'',title:task?.title??'',due_at:task?localTime(task.due_at):''});setNotice('');
      }}><option value="">Choose a deliverable</option>{available.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
      <label>Proposed deliverable title<input required maxLength={300} disabled={locked||busy} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/></label>
      <label>Proposed due time (your local time)<input required type="datetime-local" disabled={locked||busy} value={draft.due_at} onChange={event=>setDraft({...draft,due_at:event.target.value})}/></label>
      <label>Reason for the change<textarea required maxLength={1000} rows={2} disabled={locked||busy} value={draft.reason} onChange={event=>setDraft({...draft,reason:event.target.value})}/></label>
    </div>
      {selected&&<p className={css.finePrint}>Current deadline: {new Date(selected.due_at).toLocaleString('en-SG',{timeZoneName:'short'})}. The vendor has not been notified.</p>}
      <button className={css.primary} disabled={locked||busy||!selected}>Request schedule approval<ArrowRight size={14}/></button>
    </form>
  </details>;
}
