'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, RefreshCw } from 'lucide-react';
import { planningRequest, type Session, type Wedding } from '@/lib/planning-api';
import type { Contact, VendorMessage } from '@/lib/controller';
import { deliveryLabels, type MessagingState } from '@/lib/live-messaging';
import css from '@/app/controller/controller.module.css';

// Retained for a future live release; the pilot page does not mount these controls.
export function WhatsAppConnectionDesk({session,wedding,contacts,messages,locked,onSaved}: {
  session: Session; wedding: Wedding; contacts: Contact[]; messages: VendorMessage[]; locked: boolean; onSaved: () => Promise<void>;
}) {
  const [state,setState]=useState<MessagingState|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const [vendorId,setVendorId]=useState('');
  const [recipient,setRecipient]=useState('');
  const [mode,setMode]=useState<'off'|'review'|'automatic'>('off');
  const [optIn,setOptIn]=useState(false);
  const [consent,setConsent]=useState('');
  const [manual,setManual]=useState({vendor_id:'',content:''});
  const available=contacts.filter(vendor=>vendor.active!==false&&vendor.channel==='whatsapp');
  const binding=state?.bindings.find(item=>item.vendor_id===vendorId);

  async function refresh() {
    setState(await planningRequest<MessagingState>(`/api/weddings/${session.id}/messaging`,session));
  }

  useEffect(()=> {
    let active=true;
    async function load() {
      if(busyRef.current||document.visibilityState==='hidden')return;
      try {
        const next=await planningRequest<MessagingState>(`/api/weddings/${session.id}/messaging`,session);
        if(active)setState(next);
      } catch(issue) {if(active)setError((issue as Error).message);}
    }
    void load();
    const timer=setInterval(()=>void load(),5000);
    return ()=>{active=false;clearInterval(timer);};
  },[session.id,session.token]);

  useEffect(()=> {
    const vendor=contacts.find(item=>item.id===vendorId);
    setRecipient(binding?.recipient??(vendor?.contact.match(/^\+[1-9][0-9]{7,14}$/)?vendor.contact:''));
    setMode(binding?.mode??'off');setOptIn(binding?.opt_in??false);setConsent(binding?.consent_note??'');
  },[vendorId,binding?.revision]);

  async function perform(action:()=>Promise<void>) {
    if(busyRef.current||locked)return;
    busyRef.current=true;setBusy(true);setError('');setNotice('');
    try {await action();await refresh();await onSaved();}
    catch(issue){setError((issue as Error).message);try{await refresh();}catch{/* Keep original failure. */}}
    finally{busyRef.current=false;setBusy(false);}
  }

  const disabled=locked||busy;
  const liveDrafts=messages.filter(message=>message.status==='draft'&&message.source==='whatsapp');
  return <section id="whatsapp" aria-label="Live WhatsApp messaging">
    <div className={css.sectionHeading}><span className={css.eyebrow}>CONNECTED CONVERSATIONS</span><h2>WhatsApp, with a clear remit.</h2><p>Automatic enquiries can share the date, location and guest count. Your configured AI processes vendor replies to choose follow-up questions. Bookings, payments, cancellations and changed terms remain your decisions.</p></div>
    {error&&<div className={css.error} role="alert">{error}</div>}
    {notice&&<div className={css.notice} role="status">{notice}</div>}
    {!state?<p>Checking WhatsApp setup…</p>:<>
      <div className={css.notice}>
        <strong>{state.configured&&state.enabled&&state.verified?'WhatsApp account connected':!state.configured?'WhatsApp setup needed':!state.enabled?'Live sending is disabled':'Checking provider credentials'}</strong>
        <p>{state.provider==='twilio'?'Twilio WhatsApp Sandbox: every test participant must join the Sandbox and send a fresh message. Automatic replies require an open 24-hour conversation.':'Direct Meta Cloud API connection.'}</p>
        {state.missing.length>0&&<p>Private backend settings still needed: {state.missing.join(', ')}.</p>}
        {state.last_error&&<p>{state.last_error}</p>}
        {state.incoming_webhook&&<details><summary>Callback URLs for Twilio setup</summary><p>Incoming messages: {state.incoming_webhook}</p><p>Status updates: {state.status_webhook}</p><p>Use POST. Only the webhook routes should be exposed publicly.</p></details>}
        <button className={css.textButton} disabled={busy} onClick={()=>void refresh().catch(issue=>setError(issue.message))}><RefreshCw size={13}/>Check connection</button>
      </div>
      <form className={css.formPanel} onSubmit={event=>{event.preventDefault();void perform(async()=>{
        setState(await planningRequest<MessagingState>(`/api/weddings/${session.id}/messaging/vendors/${vendorId}`,session,{
          expected_revision:binding?.revision??0,brief_revision:wedding.revision,recipient,mode,opt_in:optIn,consent_note:consent,
        },'PATCH'));setNotice(mode==='automatic'?'Automatic enquiries enabled for this vendor. The worker will send when the conversation window permits.':mode==='off'?'Live messages paused for this vendor.':'Vendor connected for messages you explicitly approve.');
      });}}>
        <div className={css.fields}><label>WhatsApp vendor<select required disabled={disabled} value={vendorId} onChange={event=>setVendorId(event.target.value)}><option value="">Choose a vendor</option>{available.map(vendor=><option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label>Individual WhatsApp number<input required type="tel" placeholder="+6581234567" pattern="\+[1-9][0-9]{7,14}" disabled={disabled} value={recipient} onChange={event=>setRecipient(event.target.value)}/></label><label>Messaging permission<select disabled={disabled} value={mode} onChange={event=>setMode(event.target.value as typeof mode)}><option value="off">Off — do not send</option><option value="review">Send only messages I approve</option><option value="automatic">Automatically send enquiries and follow-ups</option></select></label><label>How the vendor opted in<input maxLength={500} required={mode!=='off'} disabled={disabled} value={consent} onChange={event=>setConsent(event.target.value)} placeholder="For a demo: my own number, joined the Sandbox"/></label></div>
        <label className={css.checkLabel}><input type="checkbox" checked={optIn} disabled={disabled} onChange={event=>setOptIn(event.target.checked)}/>I confirm this vendor agreed to receive WhatsApp enquiries from our planner.</label>
        {binding&&<p className={css.finePrint}>{binding.stopped?'Vendor opted out; they must send START before messages can resume.':binding.needs_reapproval?'The plan or account changed. Review this permission against the latest confirmed brief.':binding.window_open?'A recent vendor message opened the reply window.':'Waiting for the vendor to send a fresh WhatsApp message.'}</p>}
        <p className={css.finePrint}>Up to three automatic messages and six reply analyses per vendor per 24 hours. STOP opts out; HUMAN pauses automation. Twilio/AI usage consumes your account allowance. Re-enabling automatic mode resumes enquiries; it does not approve any booking or payment.</p>
        <button className={css.primary} disabled={disabled||!vendorId||(mode!=='off'&&(!state.configured||!state.enabled||!state.verified))}>Save WhatsApp permission<Check size={14}/></button>
      </form>
      <details className={css.formPanel}><summary>Write a message for explicit approval</summary><form onSubmit={event=>{event.preventDefault();void perform(async()=>{
        await planningRequest(`/api/weddings/${session.id}/messaging/vendors/${manual.vendor_id}/drafts`,session,{brief_revision:wedding.revision,content:manual.content});setManual({...manual,content:''});setNotice('Message saved as a draft. Review it below before choosing Send real WhatsApp message.');
      });}}><div className={css.fields}><label>Message recipient<select required disabled={disabled} value={manual.vendor_id} onChange={event=>setManual({...manual,vendor_id:event.target.value})}><option value="">Choose a connected vendor</option>{available.map(vendor=><option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label></div><label>Message to review<textarea required maxLength={3500} rows={4} disabled={disabled} value={manual.content} onChange={event=>setManual({...manual,content:event.target.value})}/></label><button className={css.secondary} disabled={disabled}>Save message draft<ArrowRight size={14}/></button></form></details>
      {liveDrafts.length>0&&<div className={css.messages}>{liveDrafts.map(message=>{
        const target=state.bindings.find(item=>item.vendor_id===message.vendor_id);
        return <article key={message.id}><strong>{contacts.find(vendor=>vendor.id===message.vendor_id)?.name} · WhatsApp draft</strong><p>{message.content}</p><button className={css.primary} disabled={disabled||!state.enabled||!state.verified||!target||target.mode==='off'||target.stopped||target.needs_reapproval||wedding.status!=='confirmed'} onClick={()=>void perform(async()=>{
          setState(await planningRequest<MessagingState>(`/api/weddings/${session.id}/messaging/messages/${message.id}/send`,session,{brief_revision:wedding.revision,binding_revision:target!.revision,expected_content:message.content}));setNotice('Approved for real WhatsApp delivery. The receipt below tracks the outcome.');
        })}>Send real WhatsApp message<ArrowRight size={14}/></button><small>To: {target?.recipient??'Connect this vendor first'}. This sends the exact text above when the reply window permits.</small></article>;
      })}</div>}
      <div className={css.deliveryList} aria-label="WhatsApp delivery records">{state.deliveries.slice(0,20).map(delivery=><article key={delivery.message_id}><strong>{contacts.find(vendor=>vendor.id===delivery.vendor_id)?.name} · {deliveryLabels[delivery.status]??delivery.status}</strong>{delivery.error&&<p>{delivery.error}</p>}{delivery.provider_id&&<small>Provider receipt: {delivery.provider_id}</small>}</article>)}</div>
    </>}
  </section>;
}
