'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BRIEF_STORAGE, PERSONALITY_STORAGE, readLocalBrief } from '@/lib/wedding-storage';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, ClipboardList, ExternalLink, Flower2, Heart, LayoutDashboard, Leaf, MapPin, Pencil, RefreshCw, Sparkles, Users, Wallet, X } from 'lucide-react';
import { DiscoveryCard } from '@/components/discovery-card';
import { VisionCarousel } from '@/components/vision-carousel';
import { pinterestSearch } from '@/lib/inspiration';
import { emptyPersonality, generateIdeas, parsePersonality, profileQuery, referenceFor, signatureCategories, toggleIdea, type IdeaKind, type InspirationIdea, type PersonalityProfile } from '@/lib/personality';
import { emptyBrief, formatMoney, priorities, readStoredBrief, type WeddingBrief } from '@/lib/wedding';
import type { PinterestResult } from '@/lib/pinterest';

const STORAGE_KEY=PERSONALITY_STORAGE;
const LEGACY_KEY=BRIEF_STORAGE;
const steps=['Your feeling','Your world','Your signature'];
type View='quiz'|'vision'|'details';
type Group='feelings'|'worlds'|'signatures';
const stepCopy=[
  {first:'How do you want',accent:'your day to feel?',copy:'Forget the details for a moment. Keep the feelings that sound like the two of you. There’s no single right answer.'},
  {first:'Where does your',accent:'story belong?',copy:'A garden, a dinner party, somewhere unexpected. Keep more than one world if your wedding lives between them.'},
  {first:'A little of this.',accent:'A little of you.',copy:'Mix colour stories, spaces and textures. Keep as many ideas as you like. You’re building a personality, not picking a package.'},
];
const decorLabels={florals:'Flowers & textures',lighting:'Lighting & atmosphere',tables:'Tables & gathering'};

function KeptIdeas({ideas,onRemove}: {ideas:InspirationIdea[];onRemove:(idea:InspirationIdea)=>void}) {
  if(!ideas.length)return null;
  return <section className="kept-ideas" aria-label="Your kept ideas"><div><Heart size={14}/><strong>{ideas.length} {ideas.length===1?'idea':'ideas'} kept</strong><span>They stay here when you reroll.</span></div><div className="kept-pills">{ideas.map(idea=><button type="button" key={idea.id} onClick={()=>onRemove(idea)} aria-label={`Remove ${idea.title}`}><span>{idea.title}</span><X size={12}/></button>)}</div></section>;
}
function Reroll({onClick,noun}: {onClick:()=>void;noun:string}) {
  return <div className="reroll-area"><p>Nothing here quite feels like you? Keep exploring.</p><button className="button secondary" type="button" onClick={onClick}><RefreshCw size={15}/>Show me more {noun}</button><span>Your kept ideas stay. New possibilities keep coming.</span></div>;
}

export default function Home() {
  const [profile,setProfile]=useState<PersonalityProfile>(emptyPersonality);
  const [brief,setBrief]=useState<WeddingBrief>(emptyBrief);
  const [view,setView]=useState<View>('quiz');
  const [step,setStep]=useState(0);
  const [furthest,setFurthest]=useState(0);
  const [category,setCategory]=useState<IdeaKind>('direction');
  const [rounds,setRounds]=useState<Record<string,number>>({});
  const [batches,setBatches]=useState<Record<string,InspirationIdea[]>>({});
  const [seed,setSeed]=useState(1);
  const [ready,setReady]=useState(false);
  const [notice,setNotice]=useState('');
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  const [storageAvailable,setStorageAvailable]=useState(true);
  const [livePinterest,setLivePinterest]=useState(false);
  const [detailTab,setDetailTab]=useState<'essentials'|'decor'|'priorities'>('essentials');
  const activeKind:IdeaKind=step===0?'feeling':step===1?'world':category;
  const activeGroup:Group=step===0?'feelings':step===1?'worlds':'signatures';
  const currentIdeas=batches[activeKind]??[];
  const kept=profile[activeGroup];
  const paletteIdeas=profile.signatures.filter(idea=>idea.kind==='palette');
  const currentCopy=stepCopy[step];
  const currentCategory=signatureCategories.find(item=>item.id===category)!;

  useEffect(()=> {
    let loadedProfile:PersonalityProfile={...emptyPersonality,feelings:[],worlds:[],signatures:[]};
    let loadedBrief={...emptyBrief,guests:'',budget:'',location:'',decor:{...emptyBrief.decor}};
    let loadedStep=0;let loadedRounds:Record<string,number>={};let loadedSeed=Date.now()%2147483647;
    let loadedView:View='quiz';
    try {
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw) {
        const stored=JSON.parse(raw);const parsed=parsePersonality(stored.profile);
        if(parsed) {
          loadedProfile=parsed;loadedBrief=readStoredBrief(stored.brief)??loadedBrief;
          loadedStep=Number.isInteger(stored.step)?Math.max(0,Math.min(2,stored.step)):0;
          loadedSeed=Number.isInteger(stored.seed)?stored.seed:loadedSeed;
          if(stored.rounds&&typeof stored.rounds==='object') for(const [key,value] of Object.entries(stored.rounds)) if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)loadedRounds[key]=value;
          loadedView=parsed.complete?'vision':'quiz';
        }
      } else {
        const legacy=localStorage.getItem(LEGACY_KEY);
        if(legacy) {
          loadedBrief=readLocalBrief(localStorage)??loadedBrief;
          loadedProfile=loadedBrief.personality;
          if(!loadedProfile.words)loadedProfile={...loadedProfile,words:loadedBrief.keywords};
          setNotice('Your earlier wedding details are safe. This shorter quiz is just about your personality; the practical details can wait.');
        }
      }
    } catch {setStorageAvailable(false);setNotice('Browser saving is unavailable. You can still explore and download your profile.');}
    setBrief(loadedBrief);setProfile(loadedProfile);setStep(loadedStep);setFurthest(loadedProfile.complete?2:loadedStep);
    setSeed(loadedSeed);setRounds(loadedRounds);setView(loadedView);
    const initial:Record<string,InspirationIdea[]>={};
    for(const kind of ['feeling','world','direction',...signatureCategories.map(item=>item.id)] as IdeaKind[]) initial[kind]=generateIdeas(kind,loadedRounds[kind]??0,loadedProfile,[],loadedSeed);
    setBatches(initial);setReady(true);
    fetch('/api/inspiration').then(response=>response.json()).then((result:PinterestResult)=>setLivePinterest(result.status==='configured'||result.status==='connected')).catch(()=>{});
  },[]);

  useEffect(()=> {
    if(!ready||!storageAvailable)return;
    try {
      const currentBrief={...brief,personality:profile};
      localStorage.setItem(STORAGE_KEY,JSON.stringify({profile,brief:currentBrief,step,rounds,seed}));
      localStorage.setItem(LEGACY_KEY,JSON.stringify(currentBrief));
    }
    catch {setStorageAvailable(false);setNotice('Your profile is still here for this session. Download it to keep a copy; browser storage is full or unavailable.');}
  },[profile,brief,step,rounds,seed,ready,storageAvailable]);

  function updateBrief<K extends keyof WeddingBrief>(key:K,value:WeddingBrief[K]) {setBrief(current=>({...current,[key]:value}));setError('');}
  function updateWords(words:string) {setProfile(current=>({...current,words,complete:false}));setError('');}
  function keepIdea(group:Group,idea:InspirationIdea) {
    setProfile(current=>({...current,complete:view==='quiz'?false:current.complete,[group]:toggleIdea(current[group],idea)}));setError('');
  }
  function showStep(index:number) {
    setView('quiz');setStep(index);setError('');setStatus('');
    if(index>step) {
      const kind:IdeaKind=index===1?'world':category;
      setBatches(current=>({...current,[kind]:generateIdeas(kind,rounds[kind]??0,profile,[],seed)}));
    }
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function reroll() {
    const nextRound=(rounds[activeKind]??0)+1;
    setBatches(current=>({...current,[activeKind]:generateIdeas(activeKind,nextRound,profile,current[activeKind]??[],seed)}));
    setRounds(current=>({...current,[activeKind]:nextRound}));
    setStatus('Four new possibilities. All the ideas you kept are still saved.');setError('');
  }
  function switchCategory(kind:IdeaKind) {setCategory(kind);setError('');setStatus('');}
  function next() {
    if(!profile.feelings.length&&!profile.words.trim()) {setStep(0);setError('Keep a feeling, or describe it in your own words.');return;}
    if(step>=1&&!profile.worlds.length) {setStep(1);setError('Keep at least one world to start from. You can keep more than one.');return;}
    if(step<2) {setFurthest(current=>Math.max(current,step+1));showStep(step+1);return;}
    if(!profile.signatures.length) {setError('Keep one overall direction, colour story or preference to give your profile a little shape.');return;}
    setProfile(current=>({...current,complete:true}));setView('vision');setError('');setNotice('Your wedding personality is saved. The practical details are a separate next step, whenever you’re ready.');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function openDetails() {setView('details');setError('');setNotice('');window.scrollTo({top:0,behavior:'smooth'});}
  function saveDetails() {
    if(brief.guests&&(!Number.isInteger(Number(brief.guests))||Number(brief.guests)<1||Number(brief.guests)>10000)) {setError('Enter a guest count between 1 and 10,000, or leave it blank for now.');return;}
    if(brief.budget&&(!Number.isFinite(Number(brief.budget))||Number(brief.budget)<=0)) {setError('Enter a positive total budget, or leave it blank for now.');return;}
    setError('');setNotice('Planning details saved in this browser. You can return to them anytime.');
  }
  function download() {
    const file={version:3,weddingPersonality:profile,weddingDetails:{...brief,personality:profile},pinterestSearch:pinterestSearch(profileQuery(profile))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='our-wedding-personality.json';link.click();URL.revokeObjectURL(url);
  }
  const allKept=[...profile.feelings,...profile.worlds,...profile.signatures];
  const signatureCount=profile.signatures.length;

  return <div className="app-shell personality-app">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Ever After home"><span className="brand-icon"><Flower2 size={25}/></span><span>ever after<span className="brand-dot">.</span></span></a>
      <div className="sidebar-caption">A LITTLE LESS PLANNING.<br/>A LOT MORE US.</div><div className="workspace-label">YOUR WEDDING SPACE</div>
      <nav aria-label="Main navigation">
        <button className={`nav-item ${view==='quiz'?'active':''}`} onClick={()=>showStep(0)}><Heart size={18}/>Personality quiz{view==='quiz'&&<span className="nav-dot"/>}</button>
        <button className={`nav-item ${view==='vision'?'active':''}`} disabled={!profile.complete} onClick={()=>{setView('vision');setNotice('');setError('');}}><LayoutDashboard size={18}/>Your wedding vision</button>
        <button className={`nav-item ${view==='details'?'active':''}`} disabled={!profile.complete} onClick={openDetails}><ClipboardList size={18}/>Plan the details<span className="nav-hint">Later</span></button>
        <Link className="nav-item" href="/planner"><Sparkles size={18}/>Your planner<span className="nav-hint">Chat</span></Link>
        <Link className="nav-item" href="/coordinator"><Users size={18}/>Coordinator<span className="nav-hint">Tasks & reminders</span></Link>
        <Link className="nav-item" href="/vendors"><Users size={18}/>Your vendors<span className="nav-hint">Compare</span></Link>
      </nav>
      <div className="sidebar-note"><Leaf size={22}/><p>There’s no one<br/>kind of beautiful.<br/>There’s your kind.</p><span>Keep what feels like the two of you.</span></div>
      <div className="profile"><span className="avatar"><Heart size={17}/></span><div><strong>{brief.names||'Your next chapter'}</strong><span>{allKept.length} ideas that feel like you</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Your wedding <ChevronRight size={14}/><span>{view==='quiz'?steps[step]:view==='details'?'Plan the details':'Your wedding vision'}</span></div><div className="header-right"><span className="prototype-badge">PERSONALITY QUIZ</span><span className="storage-label"><CheckCheck size={15}/>{ready&&storageAvailable?'Saved in this browser':'Made for the two of you'}</span></div></header>
      <main id="main-content">
        {notice&&<div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={()=>setNotice('')}>×</button></div>}
        {ready&&profile.complete&&<nav className="workspace-tabs" aria-label="Wedding workspace"><button className={view==='vision'?'active':''} onClick={()=>{setView('vision');setError('');}}><LayoutDashboard size={14}/>Your vision</button><button className={view==='quiz'?'active':''} onClick={()=>showStep(0)}><Heart size={14}/>Personality quiz</button><button className={view==='details'?'active':''} onClick={openDetails}><ClipboardList size={14}/>Plan the details</button></nav>}
        {!ready?<div className="loading-state">Opening your wedding space…</div>:view==='quiz'?<>
          <div className="eyebrow"><Sparkles size={14}/>A LITTLE SELF-DISCOVERY, FOR THE TWO OF YOU</div>
          <div className="page-heading quiz-heading"><h1>{currentCopy.first}<br/><em>{currentCopy.accent}</em></h1><div><span className="quiz-length">THREE LITTLE CHAPTERS. NO PERFECT ANSWERS.</span><p className="intro">{currentCopy.copy}</p></div></div>
          <div className="stepper personality-stepper" aria-label="Personality quiz progress">{steps.map((label,index)=><button key={label} type="button" aria-label={`Step ${index+1}: ${label}`} className={`step ${step===index?'current':''} ${step>index?'complete':''}`} aria-current={step===index?'step':undefined} disabled={index>furthest} onClick={()=>showStep(index)}><span className="step-number">{step>index?<Check size={13}/>:index+1}</span><span className="step-label">{label}</span>{index<2&&<span className="step-line"/>}</button>)}</div>
          {error&&<div className="form-error" role="alert">{error}</div>}
          {step===0&&<label className="feeling-note-label" htmlFor="personality-words"><span>Start with your own words, if you like.</span><input id="personality-words" value={profile.words} onChange={event=>updateWords(event.target.value)} placeholder="A candlelit dinner, a wild garden, a little main-character magic…" maxLength={500}/></label>}
          {step===2&&<><div className="signature-intro"><span className="eyebrow">YOUR TASTE CAN HAVE LAYERS</span><p>You can love a garden and clean lines. Or candlelight and bold colour. Keep pieces from every category that feel right.</p></div><div className="signature-categories" role="tablist" aria-label="Explore your wedding signature">{signatureCategories.map(item=><button type="button" role="tab" id={`tab-${item.id}`} aria-selected={category===item.id} aria-controls="signature-options" key={item.id} onClick={()=>switchCategory(item.id)}>{item.label}{profile.signatures.some(idea=>idea.kind===item.id)&&<span>{profile.signatures.filter(idea=>idea.kind===item.id).length}</span>}</button>)}</div></>}
          <KeptIdeas ideas={kept} onRemove={idea=>keepIdea(activeGroup,idea)}/>
          <div className="quiz-gallery-heading"><div><h2>{step===0?'What feels like your kind of celebration?':step===1?'Which worlds would you step into?':currentCategory.label}</h2><p>{step===2?currentCategory.prompt:'Keep a few. Reroll as often as you like. Clicking a picture opens Pinterest.'}</p></div><span className="multi-pick-label"><Heart size={13}/>Keep more than one</span></div>
          <p className="sr-only" role="status" aria-live="polite">{status}</p>
          <div className="personality-grid" id={step===2?'signature-options':undefined} role={step===2?'tabpanel':undefined} aria-labelledby={step===2?`tab-${category}`:undefined}>{currentIdeas.map(idea=><DiscoveryCard key={idea.id} idea={idea} selected={kept.some(item=>item.id===idea.id)} onToggle={()=>keepIdea(activeGroup,idea)} livePinterest={livePinterest}/>)}</div>
          <Reroll onClick={reroll} noun={step===0?'feelings':step===1?'wedding worlds':category==='palette'?'colour stories':'possibilities'}/>
          <div className="quiz-gentle-guide"><Leaf size={17}/><span>{step===0?'This is about how you want to feel. The flowers and seating charts can wait.':step===1?'You’re collecting inspiration, not committing to a venue or a price.':'No need to decide on flowers or furniture today. Those are a separate task for later.'}</span></div>
          <div className="form-footer"><div className="footer-left">{step>0?<button className="back-button" type="button" onClick={()=>showStep(step-1)}><ArrowLeft size={16}/>Back</button>:<span>A feeling is more than enough to start.</span>}</div><button className="button primary" type="button" onClick={next}>{step===0?'Find our worlds':step===1?'Build our signature':'Reveal our wedding personality'}<ArrowRight size={17}/></button></div>
          <div className="bottom-note">Your personality is a starting point. You can always change your mind.</div>
        </>:view==='vision'?<>
          <div className="eyebrow"><Sparkles size={14}/>A WEDDING PERSONALITY, ALL YOUR OWN</div>
          <div className="summary-heading personality-summary-heading"><div><h1>Not just a theme.<br/><em>Your kind of beautiful.</em></h1><p className="intro">{brief.names?`${brief.names}, this`:'This'} is the mix you’re drawn to. A feeling, a few worlds and all the little contrasts that make it yours.</p></div><button className="button secondary" onClick={()=>showStep(0)}><Pencil size={15}/>Keep discovering</button></div>
          <div className="personality-vision-grid"><VisionCarousel profile={profile} livePinterest={livePinterest}/><aside className="personality-profile-card"><div className="eyebrow">YOUR PERSONALITY AT A GLANCE</div><h2>A little more you.</h2>{profile.words&&<blockquote>“{profile.words}”</blockquote>}<ProfileGroup label="How it feels" ideas={profile.feelings}/><ProfileGroup label="The worlds you love" ideas={profile.worlds}/>{signatureCategories.map(item=><ProfileGroup key={item.id} label={item.label} ideas={profile.signatures.filter(idea=>idea.kind===item.id)}/>)}<a className="pinterest-link" href={pinterestSearch(profileQuery(profile))} target="_blank" rel="noreferrer">Explore our whole vibe on Pinterest <ExternalLink size={12}/></a><button className="download-button" onClick={download}><ArrowDownToLine size={15}/>Download our personality</button></aside></div>
          {paletteIdeas.length>0&&<section className="saved-palettes"><div><span className="eyebrow">THE COLOURS YOU’RE DRAWN TO</span><h2>Room for more than one colour story.</h2></div><div>{paletteIdeas.map(idea=><article key={idea.id}><div className="palette-strip">{idea.colors.map((color,index)=><span key={index} style={{background:color}} title={color}/>)}</div><span>{idea.title}</span></article>)}</div></section>}
          <section className="later-task"><div className="later-task-icon"><ClipboardList size={24}/></div><div><span className="eyebrow">A SEPARATE LITTLE CHAPTER</span><h2>Make it real. When you’re ready.</h2><p>Guest count, budget, flowers, lighting and tables belong in a calmer planning task, after the personality quiz.</p></div><button className="button secondary" onClick={openDetails}>Plan the details <ArrowRight size={16}/></button></section>
          <div className="source-note"><span>{livePinterest?'Pinterest search is connected.':'Linked Pinterest references and curated local inspiration.'}</span><span>Saved in this browser. <Link href="/planner">Bring every kept idea to your planner →</Link></span></div>
        </>:<>
          <div className="eyebrow"><Leaf size={14}/>THE QUIZ IS DONE. THIS CAN TAKE ITS TIME.</div>
          <div className="summary-heading"><div><h1>One little detail<br/><em>at a time.</em></h1><p className="intro">Your personality is already saved. Come back to these practical decisions whenever you’re ready.</p></div><button className="button secondary" onClick={()=>setView('vision')}><ArrowLeft size={15}/>Back to our vision</button></div>
          <div className="planning-task-tabs" role="tablist" aria-label="Planning detail tasks">{([['essentials','The practical bits'],['decor','Flowers, lights & tables'],['priorities','What matters most']] as const).map(([id,label])=><button type="button" role="tab" id={`planning-tab-${id}`} aria-controls="planning-task-panel" aria-selected={detailTab===id} key={id} onClick={()=>{setDetailTab(id);setError('');}}>{label}</button>)}</div>
          {error&&<div className="form-error" role="alert">{error}</div>}
          <section className="planning-task-panel" id="planning-task-panel" role="tabpanel" aria-labelledby={`planning-tab-${detailTab}`}>
            {detailTab==='essentials'?<><div className="section-heading"><Heart size={20}/><div><h2>Every plan starts with a few little details.</h2><p>Estimates are fine. Nothing here commits you to a vendor.</p></div></div><label className="field">Your names<input value={brief.names} onChange={event=>updateBrief('names',event.target.value)} placeholder="e.g. Jamie & Alex" maxLength={100}/></label><div className="field-row"><label className="field">Wedding date<input type="date" value={brief.date} onChange={event=>{updateBrief('date',event.target.value);updateBrief('flexibleDate',!event.target.value);}}/></label><label className="field">Location<div className="input-with-icon"><MapPin size={15}/><input value={brief.location} onChange={event=>updateBrief('location',event.target.value)} maxLength={100}/></div></label></div><label className="checkbox-field"><input type="checkbox" checked={brief.flexibleDate} onChange={event=>updateBrief('flexibleDate',event.target.checked)}/>We’re still deciding on a date</label><div className="field-row"><label className="field">Approximate guests<div className="input-with-icon"><Users size={15}/><input type="number" min="1" max="10000" value={brief.guests} onChange={event=>updateBrief('guests',event.target.value)}/></div></label><label className="field">Total wedding budget<div className="input-with-icon"><Wallet size={15}/><input type="number" min="1" value={brief.budget} placeholder="SGD" onChange={event=>updateBrief('budget',event.target.value)}/></div></label></div>{brief.budget&&Number(brief.budget)>0&&<p className="practical-summary">A total budget of {formatMoney(brief.budget)}. This is a preference, not a quote.</p>}</>:detailTab==='decor'?<><div className="section-heading"><Flower2 size={20}/><div><h2>Give the feeling a little shape.</h2><p>Optional notes for future conversations with a florist, venue or stylist.</p></div></div><div className="later-decor-fields">{(Object.keys(decorLabels) as (keyof typeof decorLabels)[]).map(key=><label className="field" key={key}>{decorLabels[key]}<textarea rows={3} value={brief.decor[key]} onChange={event=>updateBrief('decor',{...brief.decor,[key]:event.target.value})} placeholder="Still exploring? Leave this for another day." maxLength={1000}/><a className="pinterest-link" href={pinterestSearch(`${profileQuery(profile)} ${decorLabels[key]}`)} target="_blank" rel="noreferrer">Explore examples on Pinterest <ExternalLink size={11}/></a></label>)}</div></>:<><div className="section-heading"><Heart size={20}/><div><h2>What deserves a little more attention?</h2><p>Keep up to three priorities for the planning work ahead.</p></div></div><div className="priority-grid">{priorities.map((priority,index)=><button key={priority} type="button" aria-pressed={brief.priorities.includes(priority)} className={`priority-chip ${brief.priorities.includes(priority)?'selected':''}`} disabled={brief.priorities.length===3&&!brief.priorities.includes(priority)} onClick={()=>updateBrief('priorities',brief.priorities.includes(priority)?brief.priorities.filter(item=>item!==priority):[...brief.priorities,priority])}><span className="priority-index">0{index+1}</span>{priority}{brief.priorities.includes(priority)&&<Check size={14}/>}</button>)}</div><label className="field later-notes">Anything else we should know?<textarea value={brief.notes} rows={4} maxLength={2000} onChange={event=>updateBrief('notes',event.target.value)} placeholder="Traditions, dietary needs, accessibility, things you love or would rather skip…"/></label></>}
            <div className="planning-task-footer"><span>Saved in this browser. <Link href="/planner">Sync with your planner →</Link></span><button className="button primary" onClick={saveDetails}>Save these details <Check size={16}/></button></div>
          </section>
        </>}
      </main><footer className="site-footer"><span>Made with a little love & a lot of intention.</span><span>EVER AFTER · HACKATHON PREVIEW</span></footer>
    </div>
  </div>;
}

function ProfileGroup({label,ideas}: {label:string;ideas:InspirationIdea[]}) {
  if(!ideas.length)return null;
  return <div className="personality-profile-group"><span className="field-label">{label}</span><div>{ideas.map(idea=><span key={idea.id}>{idea.title}</span>)}</div></div>;
}
