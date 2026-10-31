'use client';

import { useEffect, useState } from 'react';
import { Check, ExternalLink, Heart, Plus } from 'lucide-react';
import { pinterestSearch } from '@/lib/inspiration';
import { referenceFor, type InspirationIdea } from '@/lib/personality';
import { localReferences } from '@/lib/visual-references';
import type { PinterestResult } from '@/lib/pinterest';

const results = new Map<string, PinterestResult>();
export function usePinterestImages(query: string, enabled: boolean) {
  const [result, setResult] = useState<PinterestResult | null>(null);
  useEffect(() => {
    if (!enabled || !query) return;
    let active = true;
    const cached = results.get(query);
    if (cached) {setResult(cached); return;}
    setResult(null);
    fetch(`/api/inspiration?query=${encodeURIComponent(query)}`).then(response=>response.json()).then((data: PinterestResult)=> {
      if(active) {results.set(query,data);setResult(data);}
    }).catch(()=>{if(active)setResult({status:'unavailable',images:[]});});
    return () => {active=false;};
  },[query,enabled]);
  return result;
}

export function DiscoveryCard({idea,selected,onToggle,livePinterest=false}: {idea:InspirationIdea;selected:boolean;onToggle:()=>void;livePinterest?:boolean}) {
  const reference=referenceFor(idea);
  const live=usePinterestImages(idea.query,livePinterest&&idea.kind!=='palette');
  const [failed,setFailed]=useState(false);
  const environments=idea.tags.filter(tag=>tag==='indoor'||tag==='outdoor');
  const localPool=localReferences.filter(photo=>environments.length!==1||photo.tags.includes(environments[0]));
  const fallback=[...localPool].sort((a,b)=>b.tags.filter(tag=>idea.tags.includes(tag)).length-a.tags.filter(tag=>idea.tags.includes(tag)).length)[0]??localReferences[0];
  const src=failed ? fallback.src : live?.images[0]?.src ?? reference.src;
  const href=idea.kind==='palette'||failed ? pinterestSearch(idea.query) : live?.images[0]?.pinterest || reference.pinterest || pinterestSearch(idea.query);
  return <article className={`personality-card ${selected?'kept':''}`} data-idea-id={idea.id}>
    <div className="personality-card-image">
      <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${idea.title} on Pinterest`}>
        {idea.kind==='palette'?<div className="colour-story-visual" aria-label={`${idea.title} colour story`}>{idea.colors.map((color,index)=><span key={index} style={{background:color}}><span>{index<2?idea.title.split(' & ')[index]:index===2?'Ivory':'Accent'}</span></span>)}</div>:<img src={src} alt={failed?fallback.alt:live?.images[0]?.alt??reference.alt} width={1000} height={700} loading="lazy" onError={()=>{if(!failed)setFailed(true);}}/>}
        <span className="image-pinterest">Explore on Pinterest <ExternalLink size={11}/></span>
      </a>
      {selected&&<span className="kept-overlay"><Heart size={12} fill="currentColor"/>Kept for us</span>}
    </div>
    <div className="personality-card-copy">
      <h3>{idea.title}</h3><p>{idea.description}</p>
      {idea.kind==='palette'&&<div className="palette-strip" aria-label={`${idea.title} colour palette`}>{idea.colors.map((color,index)=><span key={`${color}-${index}`} style={{background:color}} title={color}/>)}</div>}
      {idea.kind!=='palette'&&<div className="idea-notes">{idea.tags.filter(tag=>!['white','black','brown','green','pink','blue','orange','yellow','purple','gold'].includes(tag)).slice(0,3).map(tag=><span key={tag}>{tag}</span>)}</div>}
    </div>
    <div className="personality-card-footer"><a href={href} target="_blank" rel="noreferrer">Pinterest <ExternalLink size={11}/></a><button type="button" className={`keep-button ${selected?'selected':''}`} aria-label={`Keep ${idea.title}`} aria-pressed={selected} onClick={onToggle}>{selected?<Check size={14}/>:<Plus size={14}/>}{selected?'Kept':'Keep this'}</button></div>
  </article>;
}
