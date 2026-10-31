'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, CircleHelp, ClipboardList, ExternalLink, Flower2, Heart, LayoutDashboard, Leaf, MapPin, Pencil, RefreshCw, Sparkles, Users, Wallet } from 'lucide-react';
import { InspirationCard } from '@/components/inspiration-card';
import { emptyDecor, photoPath, photos, pinterestSearch, rankStyles, type Decor, type Direction, type Photo, type WeddingStyle } from '@/lib/inspiration';
import { emptyBrief, formatMoney, getDirection, priorities, readStoredBrief, styles, type WeddingBrief } from '@/lib/wedding';

const STORAGE_KEY = 'ever-after-wedding-brief-v1';
const steps = ['The essentials', 'Your setting', 'Your direction', 'The little details', 'Your priorities'];
const headings = [
  { first: 'Your forever,', accent: 'starts with a feeling.', copy: 'You don’t need a finished vision. Just a few details, a little curiosity, and the two of you.' },
  { first: 'Start with a feeling.', accent: 'We’ll find the words.', copy: 'Picture the atmosphere, not the logistics. Which of these places feels most like your day?' },
  { first: 'A little more specific.', accent: 'A little more you.', copy: 'The same setting can feel wonderfully different. Let’s find the version you’re drawn to.' },
  { first: 'From a feeling', accent: 'to something real.', copy: 'Here’s how your direction could come to life. Keep what you love and change what you don’t.' },
  { first: 'Keep what matters.', accent: 'Leave room for joy.', copy: 'A beautiful wedding doesn’t need everything. Tell us what deserves a little more attention.' },
];
const exampleFeelings = ['Wildflowers & laughter', 'Barefoot by the sea', 'A candlelit dinner'];
const decorLabels: Record<keyof Decor, string> = { florals: 'Flowers & textures', lighting: 'Lighting & atmosphere', tables: 'Tables & gathering' };
function detailPhoto(key: keyof Decor, words: string, fallback: Photo): Photo {
  const value = words.toLowerCase();
  if (key === 'florals') {
    if (/dried|pampas|grasses/.test(value)) return photos.barn;
    if (/colour|color|single.stem|bud vase/.test(value)) return photos.colorful;
    if (/tropical|vivid/.test(value)) return photos.jungle;
    if (/blush|rose|pastel/.test(value)) return photos.roses;
    if (/pink/.test(value)) return photos.pink;
    if (/white|hydrangea|green|foliage/.test(value)) return photos.botanical;
    return fallback;
  }
  if (key === 'lighting') {
    if (value.includes('blue')) return photos.statement;
    if (value.includes('lantern') || value.includes('fairy')) return photos.fairylights;
    if (value.includes('festoon')) return photos.bistro;
    if (value.includes('uplight')) return photos.draped;
    return photos.candles;
  }
  if (value.includes('monochrome')) return photos.monochrome;
  if (value.includes('picnic') || value.includes('cushion')) return photos.lanterns;
  if (value.includes('formal') || value.includes('gold')) return photos.white;
  if (value.includes('banquet') || value.includes('communal')) return photos.garden;
  if (value.includes('wood') || value.includes('timber') || value.includes('woven')) return photos.rustic;
  return photos.dinner;
}

function Palette({ colors }: { colors: string[] }) {
  return <div className="swatches" aria-label="Your suggested colour palette">{colors.map(color => <span key={color} style={{background: color}}/>)}</div>;
}

function RefreshOptions({ secondBatch, onRefresh, onRevisit, noun }: { secondBatch: boolean; onRefresh: () => void; onRevisit: () => void; noun: string }) {
  return <div className="refresh-area">
    {secondBatch ? <><span>You’ve explored all eight {noun} in this collection.</span><button type="button" className="button secondary" onClick={onRevisit}><ArrowLeft size={15}/>Revisit the first four</button><p>Nothing quite right? Change your words or try another setting.</p></> : <><span>Not quite your feeling? That’s useful to know, too.</span><button type="button" className="button secondary" onClick={onRefresh}><RefreshCw size={15}/>Show me four different {noun}</button><p>A fresh set of settings, materials and atmospheres. No repeats.</p></>}
  </div>;
}

export default function Home() {
  const [brief, setBrief] = useState<WeddingBrief>(emptyBrief);
  const [saved, setSaved] = useState<WeddingBrief | null>(null);
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [view, setView] = useState<'onboarding' | 'summary'>('onboarding');
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [feelingSearch, setFeelingSearch] = useState('');
  const [styleBatch, setStyleBatch] = useState(0);
  const [directionBatch, setDirectionBatch] = useState(0);
  const [refreshMessage, setRefreshMessage] = useState('');
  const chosen = styles.find(item => item.id === brief.style);
  const direction = getDirection(brief);
  const orderedStyles = useMemo(() => rankStyles(feelingSearch), [feelingSearch]);
  const visibleStyles = orderedStyles.slice(styleBatch * 4, styleBatch * 4 + 4);
  const visibleDirections = chosen?.directions.slice(directionBatch * 4, directionBatch * 4 + 4) ?? [];
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Singapore'}).format(new Date());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const value = readStoredBrief(JSON.parse(raw));
        if (value) {
          setBrief(value); setSaved(value); setFeelingSearch(value.keywords);
          if (getDirection(value)) { setView('summary'); setFurthestStep(4); }
          else {
            setStep(1); setFurthestStep(1);
            setNotice('Your wedding details are still here. Let’s add real inspiration and refine your direction.');
          }
        } else setNotice('Your previous draft could not be loaded. You can start a new one below.');
      }
    } catch { setNotice('Browser storage is unavailable. You can still create and download your brief.'); }
    setReady(true);
  }, []);

  function update<K extends keyof WeddingBrief>(key: K, value: WeddingBrief[K]) {
    setBrief(current => ({...current, [key]: value})); setError('');
  }
  function goTo(index: number) {
    setStep(index); setError(''); setRefreshMessage('');
    // Return to the set containing a saved choice so it never appears to disappear.
    if (index === 1 && chosen) setStyleBatch(Math.floor(orderedStyles.findIndex(item => item.id === chosen.id) / 4));
    if (index === 2 && direction && chosen) setDirectionBatch(Math.floor(chosen.directions.findIndex(item => item.id === direction.id) / 4));
    window.scrollTo({top: 0, behavior: 'smooth'});
  }
  function chooseStyle(style: WeddingStyle) {
    if (style.id !== brief.style) {
      setBrief(current => ({...current, style: style.id, direction: '', decor: {...emptyDecor}}));
      setDirectionBatch(0); setFurthestStep(2);
    }
    setError('');
  }
  function chooseDirection(item: Direction) {
    if (item.id !== brief.direction) setBrief(current => ({...current, direction: item.id, decor: {...item.decor}}));
    setError('');
  }
  function applyFeeling(words: string) {
    update('keywords', words); setFeelingSearch(words); setStyleBatch(0);
    setBrief(current => ({...current, keywords: words, style: '', direction: '', decor: {...emptyDecor}}));
    setFurthestStep(1); setDirectionBatch(0);
    setRefreshMessage(words.trim() ? `Four starting points for “${words.trim()}”. Choose the photo that comes closest.` : 'Four popular starting points. Choose what feels closest.');
  }
  function refreshStyles(batch: number) {
    setStyleBatch(batch); setBrief(current => ({...current, style: '', direction: '', decor: {...emptyDecor}}));
    setFurthestStep(1); setDirectionBatch(0); setError('');
    setRefreshMessage(batch ? 'Four different settings, with new photos and a different atmosphere. None from the previous set.' : 'Back to the first four settings. Take another look at what feels right.');
  }
  function refreshDirections(batch: number) {
    setDirectionBatch(batch); setBrief(current => ({...current, direction: '', decor: {...emptyDecor}}));
    setFurthestStep(2); setError('');
    setRefreshMessage(batch ? 'Four new directions: different florals, table arrangements and lighting. No repeated photos.' : 'Back to the first four directions. See if one feels closer now.');
  }
  function next() {
    let issue = ''; let issueStep = 0;
    if (!brief.names.trim()) issue = 'Tell us your names to get started.';
    else if (!brief.location.trim()) issue = 'Add a location for your wedding.';
    else if (!Number.isInteger(Number(brief.guests)) || Number(brief.guests) < 1 || Number(brief.guests) > 10000) issue = 'Enter a guest count between 1 and 10,000.';
    else if (!Number.isFinite(Number(brief.budget)) || Number(brief.budget) < 1 || Number(brief.budget) > 10000000) issue = 'Enter a budget between S$1 and S$10,000,000.';
    else if (!brief.flexibleDate && (!brief.date || brief.date < today)) issue = 'Choose a future wedding date, or select “We’re still deciding”.';
    else if (step >= 1 && !chosen) { issue = 'Choose one setting that feels closest. You can always change it later.'; issueStep = 1; }
    else if (step >= 2 && !direction) { issue = 'Choose a direction to give your wedding a little more shape.'; issueStep = 2; }
    else if (step >= 3 && Object.values(brief.decor).some(value => !value.trim())) { issue = 'Add a preference for each detail, or use the suggested starting points.'; issueStep = 3; }
    if (issue) { setError(issue); setStep(issueStep); return; }
    if (step < 4) { setFurthestStep(current => Math.max(current, step + 1)); goTo(step + 1); return; }
    const clean = {...brief, names: brief.names.trim(), location: brief.location.trim(), keywords: brief.keywords.trim(), notes: brief.notes.trim()};
    setBrief(clean); setSaved(clean); setView('summary');
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(clean)); setNotice('Your wedding vision is saved in this browser. You can keep refining it anytime.'); }
    catch { setNotice('Your brief is ready. Download a copy to keep it because browser storage is unavailable.'); }
    window.scrollTo({top: 0, behavior: 'smooth'});
  }
  function togglePriority(value: string) {
    if (brief.priorities.includes(value)) update('priorities', brief.priorities.filter(item => item !== value));
    else if (brief.priorities.length < 3) update('priorities', [...brief.priorities, value]);
  }
  function download() {
    const file = {...brief, styleName: chosen?.title, directionName: direction?.title, inspiration: direction ? {photo: direction.photo.source, photographer: direction.photo.photographer, pinterest: pinterestSearch(direction.title)} : null, planningNote: direction?.practical};
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], {type: 'application/json'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'our-wedding-brief.json'; anchor.click(); URL.revokeObjectURL(url);
  }
  const heading = headings[step];

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Ever After home"><span className="brand-icon"><Flower2 size={25}/></span><span>ever after<span className="brand-dot">.</span></span></a>
      <div className="sidebar-caption">A LITTLE LESS PLANNING.<br/>A LOT MORE US.</div>
      <div className="workspace-label">YOUR WEDDING SPACE</div>
      <nav aria-label="Main navigation">
        <button className={`nav-item ${view === 'summary' ? 'active' : ''}`} disabled={!saved || !getDirection(saved)} onClick={() => {if (saved) {setBrief(saved); setView('summary'); setError('');}}}><LayoutDashboard size={18}/>Overview{!saved && <span className="nav-hint">Next</span>}</button>
        <button className={`nav-item ${view === 'onboarding' ? 'active' : ''}`} onClick={() => {setView('onboarding'); goTo(0);}}><Heart size={18}/>Your vision<span className="nav-dot"/></button>
        <a className="nav-item" href="/planner"><Sparkles size={18}/>Your planner<span className="nav-hint">Chat</span></a>
        <div className="nav-item unavailable"><Users size={18}/>Your vendors<span className="nav-hint">Soon</span></div>
        <div className="nav-item unavailable"><ClipboardList size={18}/>The checklist<span className="nav-hint">Soon</span></div>
        <div className="nav-item unavailable"><Wallet size={18}/>Your budget<span className="nav-hint">Soon</span></div>
      </nav>
      <div className="sidebar-note"><Leaf size={22}/><p>A feeling.<br/>A vision.<br/>A day that’s yours.</p><span>We’ll find the details together.</span></div>
      <div className="profile"><span className="avatar"><Heart size={17}/></span><div><strong>{brief.names || 'Your next chapter'}</strong><span>Let’s make it yours</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Your wedding <ChevronRight size={14}/><span>{view === 'summary' ? 'Your wedding vision' : steps[step]}</span></div><div className="header-right"><span className="prototype-badge">WEBSITE PREVIEW</span><span className="storage-label"><CheckCheck size={15}/>{saved ? 'Your details are here' : 'Made for the two of you'}</span></div></header>
      <main id="main-content">
        {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
        {!ready ? <div className="loading-state">Opening your wedding space…</div> : view === 'summary' && direction && chosen ? <>
          <div className="eyebrow"><Sparkles size={14}/>FROM A FEELING TO YOUR FIRST REAL DECISIONS</div>
          <div className="summary-heading"><div><h1>Now it feels <em>like you.</em></h1><p className="intro">{brief.names}, your vision is taking shape. This is a starting point, with room to grow.</p></div><button className="button secondary" onClick={() => {setView('onboarding'); goTo(1);}}><Pencil size={15}/>Keep refining</button></div>
          <div className="vision-path"><span>Your feeling</span><span>{brief.keywords || chosen.feeling}</span><ChevronRight size={13}/><span>{chosen.title}</span><ChevronRight size={13}/><strong>{direction.title}</strong></div>
          <div className="summary-grid"><section className="summary-vision"><img className="summary-photo" src={photoPath(direction.photo)} alt={direction.photo.alt} width={1000} height={700}/><div className="summary-vision-copy"><span className="eyebrow">YOUR CHOSEN DIRECTION</span><h2>{direction.title}</h2><p>{direction.description}</p><Palette colors={direction.colors}/><a className="pinterest-link" href={pinterestSearch(direction.title)} target="_blank" rel="noreferrer">Explore this direction on Pinterest <ExternalLink size={12}/></a><a className="photo-credit" href={direction.photo.source} target="_blank" rel="noreferrer">Reference photo by {direction.photo.photographer} / Pexels</a></div></section>
          <section className="brief-card"><div className="section-heading"><Heart size={18}/><h2>Your wedding, at a glance</h2></div><dl><div><dt>The two of you</dt><dd>{brief.names}</dd></div><div><dt>When</dt><dd>{brief.flexibleDate ? 'Still finding the perfect date' : new Date(`${brief.date}T12:00:00`).toLocaleDateString('en-SG',{day:'numeric',month:'long',year:'numeric'})}</dd></div><div><dt>Where</dt><dd>{brief.location}</dd></div><div><dt>Your people</dt><dd>{Number(brief.guests).toLocaleString()} guests</dd></div><div><dt>Your budget</dt><dd>{formatMoney(brief.budget)}</dd></div></dl><div className="summary-priorities"><span className="field-label">What matters most</span><div className="tags">{brief.priorities.length ? brief.priorities.map(item => <span key={item}>{item}</span>) : <span>Still exploring</span>}</div></div>{brief.notes && <div className="personal-note"><span className="field-label">The little things</span><p>{brief.notes}</p></div>}<button className="download-button" onClick={download}><ArrowDownToLine size={16}/>Download your wedding brief</button><button className="text-button" onClick={() => {setView('onboarding'); goTo(0);}}>Edit wedding details <Pencil size={12}/></button></section></div>
          <section className="decisions-summary"><div className="style-heading"><div><span className="eyebrow">A VISION YOU CAN TALK ABOUT</span><h2>Your first decor decisions.</h2><p>Use these preferences when you start speaking with venues and stylists.</p></div><button className="text-button" onClick={() => {setView('onboarding'); goTo(3);}}>Refine details <Pencil size={12}/></button></div><div className="decision-snapshot-grid">{(Object.keys(decorLabels) as (keyof Decor)[]).map(key => <article key={key}><span className="field-label">{decorLabels[key]}</span><p>{brief.decor[key]}</p></article>)}</div></section>
          <section className="planning-guide"><div><span className="eyebrow">YOUR NEXT THOUGHTFUL STEPS</span><h2>Let’s make room for the real day.</h2><p>These are questions to explore next, before committing to a vendor.</p></div><ol><li><span>01</span><div><strong>Find a space that supports your vision</strong><p>{direction.practical}</p></div></li><li><span>02</span><div><strong>Make the numbers work</strong><p>Ask for itemised venue, catering and decor quotes against your {formatMoney(brief.budget)} budget. These photos are inspiration, not priced packages.</p></div></li><li><span>03</span><div><strong>Turn your preferences into a vendor brief</strong><p>Share your direction, guest count, flower, lighting and table preferences. Ask what is included and what needs a separate rental.</p></div></li></ol></section>
          <div className="privacy-note"><CircleHelp size={15}/><span>Your vision is saved in this browser. <a href="/planner">Continue with your planner</a> to save it with your conversation and explore it together.</span></div>
        </> : <>
          <div className="eyebrow"><Sparkles size={14}/>YOUR WEDDING, ONE THOUGHTFUL STEP AT A TIME</div>
          <div className="page-heading"><h1>{heading.first}<br/><em>{heading.accent}</em></h1><p className="intro">{heading.copy}</p></div>
          <div className="stepper" aria-label="Wedding vision progress">{steps.map((label, index) => <button key={label} type="button" className={`step ${step === index ? 'current' : ''} ${step > index ? 'complete' : ''}`} aria-current={step === index ? 'step' : undefined} aria-label={`Step ${index + 1}: ${label}`} disabled={index > furthestStep} onClick={() => goTo(index)}><span className="step-number">{step > index ? <Check size={13}/> : index + 1}</span><span className="step-label">{label}</span>{index < steps.length - 1 && <span className="step-line"/>}</button>)}</div>
          <form onSubmit={event => {event.preventDefault(); next();}} noValidate>
            {error && <div className="form-error" role="alert">{error}</div>}
            {step === 0 && <div className="essentials-grid"><section className="form-card"><div className="section-heading"><span className="small-flower"><Flower2 size={19}/></span><div><h2>Every story starts somewhere.</h2><p>A few little details, then we’ll find your feeling together.</p></div></div><label className="field">Your names<input value={brief.names} onChange={event => update('names',event.target.value)} placeholder="e.g. Jamie & Alex" maxLength={100} required/></label><div className="field-row"><label className="field">Wedding date<input type="date" value={brief.date} min={today} onChange={event => {update('date',event.target.value); update('flexibleDate',!event.target.value);}}/></label><label className="field">Location<div className="input-with-icon"><MapPin size={15}/><input value={brief.location} onChange={event => update('location',event.target.value)} maxLength={100} required/></div></label></div><label className="checkbox-field"><input type="checkbox" checked={brief.flexibleDate} onChange={event => update('flexibleDate',event.target.checked)}/><span>We’re still deciding on a date</span></label><div className="field-row"><label className="field">Number of guests<div className="input-with-icon"><Users size={15}/><input type="number" min="1" max="10000" value={brief.guests} onChange={event => update('guests',event.target.value)} required/></div></label><label className="field">Total wedding budget<div className="input-with-icon"><span className="currency">S$</span><input type="number" min="1" max="10000000" value={brief.budget} onChange={event => update('budget',event.target.value)} required/></div></label></div><div className="gentle-note"><Leaf size={15}/><span>Estimates are absolutely fine. We’ll refine the details as you go.</span></div></section><aside className="inspiration-card"><div className="inspiration-picture"><img className="essentials-photo" src={photoPath(photos.garden)} alt={photos.garden.alt} width={1000} height={700}/><span className="picture-label">YOUR DAY COULD START HERE</span></div><div className="inspiration-copy"><span className="handwritten">Room for your kind of magic.</span><p>A feeling becomes a setting.<br/>A setting becomes a day that’s yours.</p><a className="photo-credit" href={photos.garden.source} target="_blank" rel="noreferrer">Josh Withers / Pexels</a></div></aside></div>}
            {step === 1 && <section className="discovery-section"><div className="feeling-prompt"><label className="field" htmlFor="feeling">If your wedding were a feeling, what would it be?</label><div className="feeling-input"><input id="feeling" value={brief.keywords} onChange={event => update('keywords', event.target.value)} placeholder="e.g. wildflowers, warm candlelight, a dinner with our favourite people…" maxLength={300}/><button type="button" onClick={() => applyFeeling(brief.keywords)}><Sparkles size={15}/>Find my starting points</button></div><div className="feeling-examples"><span>Or try a feeling:</span>{exampleFeelings.map(words => <button type="button" key={words} onClick={() => applyFeeling(words)}>{words}</button>)}</div></div><div className="style-heading"><div><span className="eyebrow">01 / THE BIG PICTURE</span><h2>Where do you picture yourselves?</h2><p>{feelingSearch ? `Four starting points for “${feelingSearch}”.` : 'Four popular starting points. Pick what feels closest, even if it’s not quite there yet.'}</p></div><span className="collection-count">{styleBatch * 4 + 1}–{styleBatch * 4 + 4} of 8 settings</span></div><p className="sr-only" role="status" aria-live="polite">{refreshMessage}</p><div className="discovery-grid">{visibleStyles.map(style => <InspirationCard key={style.id} id={style.id} title={style.title} description={style.subtitle} feeling={style.feeling} photo={style.photo} colors={style.colors} selected={brief.style === style.id} onSelect={() => chooseStyle(style)}/>)}</div><RefreshOptions noun="settings" secondBatch={styleBatch === 1} onRefresh={() => refreshStyles(1)} onRevisit={() => refreshStyles(0)}/>{chosen && <div className="guide-callout"><Leaf size={19}/><div><strong>{chosen.title} feels like you. Let’s explore what that can mean.</strong><p>Next, we’ll compare four specific directions, then turn your favourite into decor decisions.</p></div></div>}</section>}
            {step === 2 && chosen && <section className="discovery-section"><div className="selected-setting"><img src={photoPath(chosen.photo)} alt={chosen.photo.alt} width={80} height={80}/><div><span className="eyebrow">YOUR STARTING POINT</span><strong>{chosen.title}</strong><span>{brief.keywords || chosen.feeling}</span></div><button type="button" className="text-button" onClick={() => goTo(1)}>Change setting <Pencil size={12}/></button></div><div className="style-heading"><div><span className="eyebrow">02 / FIND YOUR VERSION</span><h2>{chosen.title}, but what kind?</h2><p>Notice the flowers, the light and how people gather. Which version feels most like you?</p></div><span className="collection-count">{directionBatch * 4 + 1}–{directionBatch * 4 + 4} of 8 directions</span></div><p className="sr-only" role="status" aria-live="polite">{refreshMessage}</p><div className="discovery-grid">{visibleDirections.map(item => <InspirationCard key={item.id} id={item.id} title={item.title} description={item.description} photo={item.photo} colors={item.colors} selected={brief.direction === item.id} onSelect={() => chooseDirection(item)}/>)}</div><RefreshOptions noun="directions" secondBatch={directionBatch === 1} onRefresh={() => refreshDirections(1)} onRevisit={() => refreshDirections(0)}/>{direction && <div className="guide-callout"><Sparkles size={19}/><div><strong>We’re hearing: {direction.title.toLowerCase()}.</strong><p>{brief.decor.florals}, {brief.decor.lighting.toLowerCase()} and {brief.decor.tables.toLowerCase()}. Let’s make those details yours.</p></div></div>}</section>}
            {step === 3 && direction && <section className="decor-section"><div className="selected-setting"><img src={photoPath(direction.photo)} alt={direction.photo.alt} width={80} height={80}/><div><span className="eyebrow">THE DIRECTION YOU’RE SHAPING</span><strong>{direction.title}</strong><span>Suggestions to start from. Every detail is yours to change.</span></div><button type="button" className="text-button" onClick={() => goTo(2)}>Change direction <Pencil size={12}/></button></div><div className="style-heading"><div><span className="eyebrow">03 / MAKE IT TANGIBLE</span><h2>What does that look like on the day?</h2><p>Refine these three details. They’ll become the beginning of your vendor brief.</p></div><button type="button" className="text-button" onClick={() => update('decor', {...direction.decor})}>Reset suggestions <RefreshCw size={12}/></button></div><div className="decor-grid">{(Object.keys(decorLabels) as (keyof Decor)[]).map((key, index) => <article className="decor-card" key={key}><img src={photoPath(detailPhoto(key, brief.decor[key], direction.photo))} alt={(detailPhoto(key, brief.decor[key], direction.photo)).alt} width={1000} height={700}/><div><span className="eyebrow">DETAIL 0{index + 1}</span><label className="field">{decorLabels[key]}<textarea rows={3} maxLength={300} value={brief.decor[key]} onChange={event => update('decor',{...brief.decor, [key]: event.target.value})}/></label><button type="button" className="text-button" onClick={() => update('decor',{...brief.decor, [key]: 'Open to suggestions — please help us compare options'})}>Help us decide</button><a className="pinterest-link" href={pinterestSearch(`${direction.title} ${decorLabels[key]}`)} target="_blank" rel="noreferrer">See more examples <ExternalLink size={11}/></a><a className="photo-credit" href={detailPhoto(key, brief.decor[key], direction.photo).source} target="_blank" rel="noreferrer">{detailPhoto(key, brief.decor[key], direction.photo).photographer} / Pexels</a></div></article>)}</div><div className="guide-callout"><Leaf size={19}/><div><strong>One practical thing to keep in mind.</strong><p>{direction.practical} We’ll keep this with your brief so the beautiful details work in real life, too.</p></div></div><p className="reference-note">Photos show individual reference details. Your venue and vendors will confirm what’s possible within your budget.</p></section>}
            {step === 4 && <section className="priorities-card"><div className="section-heading"><Heart size={22}/><div><h2>What would make the day feel right?</h2><p>Pick up to three priorities. We’ll keep these beside your decor preferences.</p></div></div><div className="priority-grid">{priorities.map((priority, index) => <button type="button" key={priority} className={`priority-chip ${brief.priorities.includes(priority) ? 'selected' : ''}`} onClick={() => togglePriority(priority)} disabled={brief.priorities.length === 3 && !brief.priorities.includes(priority)} aria-pressed={brief.priorities.includes(priority)}><span className="priority-index">0{index + 1}</span>{priority}<span className="priority-check">{brief.priorities.includes(priority) ? <Check size={16}/> : '+'}</span></button>)}</div><div className="priority-count">{brief.priorities.length} of 3 selected · it’s fine to leave room to explore</div><label className="field">Anything else that would make this yours?<textarea value={brief.notes} onChange={event => update('notes',event.target.value)} placeholder="Family traditions, dietary needs, accessibility, things you love (or really don’t)…" rows={4} maxLength={2000}/></label><div className="gentle-note"><Leaf size={15}/><span>Next, you’ll see your feeling, chosen direction and concrete preferences together.</span></div></section>}
            <div className="form-footer"><div className="footer-left">{step > 0 ? <button type="button" className="back-button" onClick={() => goTo(step - 1)}><ArrowLeft size={16}/>Back</button> : <><Heart size={15}/><span>A feeling is more than enough to start.</span></>}</div><div className="continue-group">{step === 1 && chosen && <span>Next: explore {chosen.title.toLowerCase()} directions</span>}{step === 2 && direction && <span>Next: flowers, lighting & tables</span>}<button className="button primary" type="submit">{step === 0 ? 'Find our feeling' : step === 1 ? 'Explore this setting' : step === 2 ? 'Shape the details' : step === 3 ? 'Choose our priorities' : 'See our wedding vision'}<ArrowRight size={17}/></button></div></div>
          </form><div className="bottom-note">You don’t have to know exactly what you want. That’s what this journey is for.</div>
        </>}
      </main><footer className="site-footer"><span>Made with a little love & a lot of intention.</span><span>EVER AFTER · HACKATHON PREVIEW</span></footer>
    </div>
  </div>;
}
