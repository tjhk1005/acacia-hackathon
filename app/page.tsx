"use client";

import { useEffect, useId, useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, CircleHelp, ClipboardList, Flower2, Heart, LayoutDashboard, Leaf, MapPin, Pencil, Sparkles, Users, Wallet } from "lucide-react";
import { emptyBrief, formatMoney, isWeddingBrief, priorities, styles, type WeddingBrief } from "@/lib/wedding";

const STORAGE_KEY = "ever-after-wedding-brief-v1";
const steps = ["The essentials", "Find your feeling", "Make it yours"];

function WeddingArt({ variant = "garden", large = false }: { variant?: string; large?: boolean }) {
  const uid = useId().replaceAll(":", "");
  const modern = variant === "modern";
  const coastal = variant === "coastal";
  const background = coastal ? "#d9e2df" : modern ? "#dfd2c2" : "#dce1d1";
  const dark = coastal ? "#718f91" : modern ? "#927763" : "#6a795c";
  return <svg className={`wedding-art ${large ? "large" : ""}`} viewBox="0 0 500 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${variant} wedding concept illustration`}>
    <defs>
      <linearGradient id={`sky-${uid}`} x2="0" y2="1"><stop stopColor={background}/><stop offset="1" stopColor="#f7f1e5"/></linearGradient>
      <linearGradient id={`cloth-${uid}`} x2="1" y2="1"><stop stopColor="#fffaf0"/><stop offset="1" stopColor="#dbcebc"/></linearGradient>
    </defs>
    <rect width="500" height="400" fill={`url(#sky-${uid})`}/>
    <circle cx="375" cy="78" r="43" fill="#faf4de" opacity=".7"/>
    {coastal ? <><path d="M0 190 Q130 170 260 190 T500 188 V400 H0Z" fill="#9cb4b4"/><path d="M0 234 Q100 210 250 230 T500 218 V400 H0Z" fill="#e5d8bd"/><path d="M0 213 Q120 198 260 214 T500 204" stroke="#f8f6e9" strokeWidth="4" fill="none"/></> : <>
      <path d="M0 275 Q140 210 300 260 T500 238 V400 H0Z" fill={modern ? "#c9b9a3" : "#b7c2a0"}/>
      <path d="M0 322 Q180 272 500 302 V400 H0Z" fill={modern ? "#bdab94" : "#a1af8c"}/>
    </>}
    {modern ? <><rect x="118" y="68" width="264" height="220" rx="130" fill="#c1a68e"/><rect x="144" y="94" width="212" height="194" rx="106" fill="#f1e6d6"/></> : <><path d="M158 284 V166 A92 92 0 0 1 184 102 A92 92 0 0 1 342 166 V284" fill="none" stroke="#d8c5a4" strokeWidth="8"/>
      {[0,1,2,3,4,5,6,7].map(i=><g key={i} transform={`translate(${160 + i*24},${153 - Math.sin(i/7*Math.PI)*75}) rotate(${i*24})`}><ellipse rx="12" ry="29" fill={dark} opacity=".88"/><ellipse cx="17" cy="8" rx="8" ry="23" fill="#8d9b76" transform="rotate(65)"/>{i%2===0&&<><circle cx="4" cy="-9" r="13" fill="#e8bcaa"/><circle cx="13" cy="0" r="10" fill="#f2d7c4"/><circle cx="3" cy="4" r="8" fill="#faf0dc"/></>}</g>)}
    </>}
    <ellipse cx="250" cy="340" rx="143" ry="25" fill="#766e59" opacity=".14"/>
    {[108,363].map(x=><g key={x}><path d={`M${x} 275 v68 m24-68 v68 M${x-3} 288 h30`} stroke="#967b59" strokeWidth="5" fill="none"/><rect x={x-3} y="247" width="30" height="40" rx="14" fill="#b49a73"/><path d={`M${x+5} 251 v30 m10-30 v30`} stroke="#e8d8ba" strokeWidth="2"/></g>)}
    <path d="M153 273 Q250 251 347 273 L359 336 Q250 353 141 336Z" fill={`url(#cloth-${uid})`}/>
    <ellipse cx="250" cy="273" rx="98" ry="19" fill="#fffaf0"/>
    <path d="M205 282 l-8 59 m61-58 6 64 m49-66 11 60" stroke="#c8bda9" opacity=".45" fill="none"/>
    {[196,303].map(x=><g key={x}><ellipse cx={x} cy="274" rx="17" ry="6" fill="#e5d7bf"/><ellipse cx={x} cy="273" rx="12" ry="4" fill="#faf8ef"/><path d={`M${x+23} 254 v18 m-5 0 h10`} stroke="#b7a380" fill="none"/><path d={`M${x+18} 248 q5 11 10 0Z`} stroke="#b7a380" fill="#f7edd8"/></g>)}
    <path d="M238 266 h25 l-4 12 h-17Z" fill="#b5a587"/>
    {[0,1,2,3,4].map(i=><g key={i}><path d={`M250 268 q${(i-2)*10} -15 ${(i-2)*13} -${25+Math.abs(i-2)*4}`} stroke={dark} fill="none" strokeWidth="2"/><circle cx={250+(i-2)*13} cy={243-Math.abs(i-2)*4} r={i%2===0?9:12} fill={i%2===0?"#e4af9a":"#f7e6d1"}/></g>)}
    {!modern&&<><path d="M0 0 q30 38 67 84 M500 0 q-30 38-67 84" stroke={dark} strokeWidth="4" fill="none"/>{[0,1,2,3,4].map(i=><g key={i}><ellipse cx={i*17} cy={i*16} rx="12" ry="26" transform={`rotate(-40 ${i*17} ${i*16})`} fill={dark}/><ellipse cx={500-i*17} cy={i*16} rx="12" ry="26" transform={`rotate(40 ${500-i*17} ${i*16})`} fill={dark}/></g>)}</>}
  </svg>;
}

export default function Home() {
  const [brief, setBrief] = useState<WeddingBrief>(emptyBrief);
  const [saved, setSaved] = useState<WeddingBrief | null>(null);
  const [step, setStep] = useState(0);
  const [view, setView] = useState<"onboarding" | "summary">("onboarding");
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const chosen = styles.find(s => s.id === brief.style) ?? styles[0];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (isWeddingBrief(value)) { setBrief(value); setSaved(value); setView("summary"); }
        else setNotice("Your previous draft could not be loaded. You can start a new one below.");
      }
    } catch { setNotice("Browser storage is unavailable. You can still create and download your brief."); }
    setReady(true);
  }, []);

  function update<K extends keyof WeddingBrief>(key: K, value: WeddingBrief[K]) {
    setBrief(current => ({ ...current, [key]: value }));
    setError("");
  }

  function validate() {
    if (!brief.names.trim()) return "Tell us your names to get started.";
    if (!brief.location.trim()) return "Add a location for your wedding.";
    if (!Number.isInteger(Number(brief.guests)) || Number(brief.guests) < 1 || Number(brief.guests) > 10000) return "Enter a guest count between 1 and 10,000.";
    if (!Number.isFinite(Number(brief.budget)) || Number(brief.budget) < 1 || Number(brief.budget) > 10000000) return "Enter a budget between S$1 and S$10,000,000.";
    if (!brief.flexibleDate && (!brief.date || brief.date < today)) return "Choose a future wedding date, or select ‘We’re still deciding’.";
    return "";
  }

  function next() {
    const validation = validate();
    if (validation) { setStep(0); setError(validation); return; }
    setError("");
    if (step < 2) { setStep(step+1); return; }
    const clean = { ...brief, names: brief.names.trim(), location: brief.location.trim(), keywords: brief.keywords.trim(), notes: brief.notes.trim() };
    setBrief(clean); setSaved(clean); setView("summary");
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(clean)); setNotice("Your wedding brief is saved in this browser."); }
    catch { setNotice("Your brief is ready. Browser storage is unavailable, so download a copy to keep it."); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function togglePriority(value: string) {
    if (brief.priorities.includes(value)) update("priorities", brief.priorities.filter(p => p !== value));
    else if (brief.priorities.length < 3) update("priorities", [...brief.priorities, value]);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(brief, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "our-wedding-brief.json"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Ever After home"><span className="brand-icon"><Flower2 size={25}/></span><span>ever after<span className="brand-dot">.</span></span></a>
      <div className="sidebar-caption">A LITTLE LESS PLANNING.<br/>A LOT MORE US.</div>
      <div className="workspace-label">YOUR WEDDING SPACE</div>
      <nav aria-label="Main navigation">
        <button className={`nav-item ${view === "summary" ? "active" : ""}`} disabled={!saved} onClick={() => { if(saved) { setBrief(saved); setView("summary"); setError(""); } }}><LayoutDashboard size={18}/>Overview{!saved&&<span className="nav-hint">Next</span>}</button>
        <button className={`nav-item ${view === "onboarding" ? "active" : ""}`} onClick={() => { setView("onboarding"); setStep(0); setError(""); }}><Heart size={18}/>Your vision<span className="nav-dot"/></button>
        <div className="nav-item unavailable"><Users size={18}/>Your vendors<span className="nav-hint">Soon</span></div>
        <div className="nav-item unavailable"><ClipboardList size={18}/>The checklist<span className="nav-hint">Soon</span></div>
        <div className="nav-item unavailable"><Wallet size={18}/>Your budget<span className="nav-hint">Soon</span></div>
      </nav>
      <div className="sidebar-note"><Leaf size={22}/><p>Big dreams.<br/>Small, thoughtful steps.</p><span>We’ll take it one step at a time.</span></div>
      <div className="profile"><span className="avatar"><Heart size={17}/></span><div><strong>{brief.names || "Your next chapter"}</strong><span>Let’s make it yours</span></div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Your wedding <ChevronRight size={14}/><span>{view === "summary" ? "Overview" : "Your vision"}</span></div><div className="header-right"><span className="prototype-badge">WEBSITE PREVIEW</span><span className="storage-label"><CheckCheck size={15}/>{saved ? "Brief saved" : "Made for the two of you"}</span></div></header>
      <main id="main-content">
        {notice&&<div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={()=>setNotice("")}>×</button></div>}
        {!ready ? <div className="loading-state">Opening your wedding space…</div> : view === "summary" ? <>
          <div className="eyebrow"><Sparkles size={14}/>YOUR NEXT CHAPTER</div>
          <div className="summary-heading"><div><h1>A little more <em>you.</em></h1><p className="intro">{brief.names}, here’s the beginning of something beautiful.</p></div><button className="button secondary" onClick={()=>{setStep(0);setView("onboarding");}}><Pencil size={15}/>Edit your brief</button></div>
          <div className="summary-grid"><section className="summary-vision"><WeddingArt variant={brief.style} large/><div className="summary-vision-copy"><span className="eyebrow">YOUR CHOSEN DIRECTION</span><h2>{chosen.title}</h2><p>{brief.keywords || chosen.subtitle}</p><div className="swatches">{chosen.colors.map(c=><span key={c} style={{background:c}}/>)}</div><span className="illustration-note">Concept illustration · your inspiration, not a vendor listing</span></div></section>
          <section className="brief-card"><div className="section-heading"><Heart size={18}/><h2>Your wedding, at a glance</h2></div><dl><div><dt>The two of you</dt><dd>{brief.names}</dd></div><div><dt>When</dt><dd>{brief.flexibleDate?"Still finding the perfect date":new Date(`${brief.date}T12:00:00`).toLocaleDateString("en-SG",{day:"numeric",month:"long",year:"numeric"})}</dd></div><div><dt>Where</dt><dd>{brief.location}</dd></div><div><dt>Your people</dt><dd>{Number(brief.guests).toLocaleString()} guests</dd></div><div><dt>Your budget</dt><dd>{formatMoney(brief.budget)}</dd></div></dl><div className="summary-priorities"><span className="field-label">What matters most</span><div className="tags">{brief.priorities.length ? brief.priorities.map(p=><span key={p}>{p}</span>):<span>Still exploring</span>}</div></div>{brief.notes&&<div className="personal-note"><span className="field-label">The little things</span><p>{brief.notes}</p></div>}<button className="download-button" onClick={download}><ArrowDownToLine size={16}/>Download your wedding brief</button></section></div>
          <section className="next-chapter"><span className="next-icon"><Users size={23}/></span><div><span className="eyebrow">UP NEXT</span><h2>Let’s find your kind of people.</h2><p>Vendor matching, quotes and planning tools are the next pieces we’re building.</p></div><span className="coming-soon">Coming soon</span></section>
          <div className="privacy-note"><CircleHelp size={15}/><span>This preview saves your brief only in this browser. No AI requests or vendor messages are sent.</span></div>
        </> : <>
          <div className="eyebrow"><Sparkles size={14}/>FIRST, LET’S DREAM A LITTLE</div>
          <div className="page-heading"><h1>Your forever,<br/>starts with <em>a feeling.</em></h1><p className="intro">Before the spreadsheets and the seating charts,<br className="desktop-break"/> let’s find what feels like the two of you.</p></div>
          <div className="stepper" aria-label="Wedding brief progress">{steps.map((label,index)=><button key={label} className={`step ${step===index?"current":""} ${step>index?"complete":""}`} aria-current={step===index?"step":undefined} disabled={index>step} onClick={()=>{setStep(index);setError("");}}><span className="step-number">{step>index?<Check size={13}/>:index+1}</span><span>{label}</span>{index<2&&<span className="step-line"/>}</button>)}</div>
          <form onSubmit={event=>{event.preventDefault();next();}} noValidate>
            {error&&<div className="form-error" role="alert">{error}</div>}
            {step===0&&<div className="essentials-grid"><section className="form-card"><div className="section-heading"><span className="small-flower"><Flower2 size={19}/></span><div><h2>Every story starts somewhere.</h2><p>A few little details to help us get to know yours.</p></div></div>
              <label className="field">Your names<input autoComplete="off" value={brief.names} onChange={e=>update("names",e.target.value)} placeholder="e.g. Jamie & Alex" maxLength={100} required/></label>
              <div className="field-row"><label className="field">Wedding date<input aria-describedby="flexible-date-note" type="date" value={brief.date} min={today} onChange={e=>{update("date",e.target.value);update("flexibleDate",!e.target.value);}}/></label><label className="field">Location<div className="input-with-icon"><MapPin size={15}/><input value={brief.location} onChange={e=>update("location",e.target.value)} placeholder="City or region" maxLength={100} required/></div></label></div>
              <label className="checkbox-field" id="flexible-date-note"><input type="checkbox" checked={brief.flexibleDate} onChange={e=>update("flexibleDate",e.target.checked)}/><span>We’re still deciding on a date</span></label>
              <div className="field-row"><label className="field">Number of guests<div className="input-with-icon"><Users size={15}/><input type="number" min="1" max="10000" value={brief.guests} onChange={e=>update("guests",e.target.value)} required/></div></label><label className="field">Total wedding budget<div className="input-with-icon"><span className="currency">S$</span><input type="number" min="1" max="10000000" value={brief.budget} onChange={e=>update("budget",e.target.value)} required/></div></label></div>
              <div className="gentle-note"><Leaf size={15}/><span>Nothing is set in stone. You can change these anytime.</span></div>
            </section><aside className="inspiration-card"><div className="inspiration-picture"><WeddingArt variant={brief.style} large/><span className="picture-label">A LITTLE INSPIRATION</span></div><div className="inspiration-copy"><span className="handwritten">Room for your kind of magic.</span><p>The big celebration. The small gathering.<br/>The beautifully somewhere in between.</p><div className="tiny-flower"><Flower2 size={19}/></div></div></aside></div>}
            {step===1&&<section className="style-section"><div className="style-heading"><div><h2>Which one feels like you?</h2><p>Choose a starting point. There’s plenty of room to make it your own.</p></div><span className="concept-label">Curated concept illustrations</span></div><div className="style-grid">{styles.map(style=><button type="button" className={`style-card ${brief.style===style.id?"selected":""}`} key={style.id} onClick={()=>update("style",style.id)} aria-pressed={brief.style===style.id}><div className="style-image"><WeddingArt variant={style.id}/><span className="selection-indicator">{brief.style===style.id&&<Check size={15}/>}</span></div><div className="style-copy"><h3>{style.title}</h3><p>{style.subtitle}</p><div className="swatches">{style.colors.map(c=><span key={c} style={{background:c}}/>)}</div><div className="style-tags">{style.tags.join(" · ")}</div></div></button>)}</div><label className="field keywords-field">Describe your day in a few words<input value={brief.keywords} onChange={e=>update("keywords",e.target.value)} placeholder="e.g. intimate, candlelit, a little whimsical…" maxLength={300}/></label></section>}
            {step===2&&<section className="priorities-card"><div className="section-heading"><Heart size={22}/><div><h2>It’s the little things that make it yours.</h2><p>Pick up to three things you’d love to put first.</p></div></div><div className="priority-grid">{priorities.map((priority,index)=><button type="button" key={priority} className={`priority-chip ${brief.priorities.includes(priority)?"selected":""}`} onClick={()=>togglePriority(priority)} disabled={brief.priorities.length===3&&!brief.priorities.includes(priority)} aria-pressed={brief.priorities.includes(priority)}><span className="priority-index">0{index+1}</span>{priority}<span className="priority-check">{brief.priorities.includes(priority)?<Check size={16}/>:"+"}</span></button>)}</div><div className="priority-count">{brief.priorities.length} of 3 selected · you can also leave this open for now</div><label className="field">Anything else we should know?<textarea value={brief.notes} onChange={e=>update("notes",e.target.value)} placeholder="Family traditions, dietary needs, accessibility, things you love (or really don’t)…" rows={4} maxLength={2000}/></label><div className="gentle-note"><Leaf size={15}/><span>Your brief stays in this browser. You can download a copy after saving.</span></div></section>}
            <div className="form-footer"><div className="footer-left">{step>0?<button type="button" className="back-button" onClick={()=>{setStep(step-1);setError("");}}><ArrowLeft size={16}/>Back</button>:<><span className="footer-heart"><Heart size={15}/></span><span>A wedding that feels like you. A process that feels lighter.</span></>}</div><button className="button primary" type="submit">{step===2?"Save our wedding brief":"Continue"}<ArrowRight size={17}/></button></div>
          </form>
          <div className="bottom-note">A thoughtful beginning to your happily ever after.</div>
        </>}
      </main>
      <footer className="site-footer"><span>Made with a little love & a lot of intention.</span><span>EVER AFTER · HACKATHON PREVIEW</span></footer>
    </div>
  </div>;
}
