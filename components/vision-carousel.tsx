'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { pinterestSearch } from '@/lib/inspiration';
import { profileQuery, visionReferences, type PersonalityProfile } from '@/lib/personality';
import { usePinterestImages } from './discovery-card';

export function VisionCarousel({profile,livePinterest=false}: {profile:PersonalityProfile;livePinterest?:boolean}) {
  const query=profileQuery(profile);
  const live=usePinterestImages(query,livePinterest);
  const local=visionReferences(profile);
  const candidates=[...(live?.images.map(image=>({...image,tags:[],source:'pinterest-live' as const}))??[]),...local];
  const images=candidates.filter((image,index,all)=>all.findIndex(other=>other.src===image.src)===index);
  const [index,setIndex]=useState(0);
  const [failed,setFailed]=useState<string[]>([]);
  const shown=images.filter(image=>!failed.includes(image.id));
  const active=shown[index%Math.max(1,shown.length)];
  useEffect(()=>{setIndex(0);setFailed([]);},[query]);
  function move(change:number) {setIndex(current=>(current+change+shown.length)%Math.max(1,shown.length));}
  return <section className="vision-carousel" aria-label="Your wedding moodboard" aria-roledescription="carousel" tabIndex={0} onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}}}>
    {active?<>
      <a className="carousel-main-image" href={active.pinterest||pinterestSearch(query)} target="_blank" rel="noreferrer" aria-label="Explore this moodboard image on Pinterest"><img src={active.src} alt={active.alt} width={1200} height={800} onError={()=>setFailed(current=>[...current,active.id])}/><span>Explore on Pinterest <ExternalLink size={12}/></span></a>
      <div className="carousel-controls"><div><span className="eyebrow">YOUR WEDDING MOODBOARD</span><span aria-live="polite">{index%shown.length+1} / {shown.length} · shaped by the ideas you kept</span></div><div><button type="button" aria-label="Previous moodboard image" onClick={()=>move(-1)} disabled={shown.length<2}><ArrowLeft size={17}/></button><button type="button" aria-label="Next moodboard image" onClick={()=>move(1)} disabled={shown.length<2}><ArrowRight size={17}/></button></div></div>
      <div className="carousel-thumbnails" aria-label="Choose a moodboard image">{shown.map((image,imageIndex)=><button key={image.id} type="button" aria-label={`Show moodboard image ${imageIndex+1}`} aria-current={index%shown.length===imageIndex?'true':undefined} onClick={()=>setIndex(imageIndex)}><img src={image.src} alt="" width={100} height={80} loading="lazy"/></button>)}</div>
    </>:<div className="empty-moodboard"><h2>A very particular kind of beautiful.</h2><p>We don’t have a close enough reference for this combination yet. Explore the exact mix on Pinterest, or keep refining your profile.</p><a className="button secondary" href={pinterestSearch(query)} target="_blank" rel="noreferrer">Explore our vibe <ExternalLink size={14}/></a></div>}
    <p className="moodboard-note">Reference images for your taste, not a promise of a particular venue or package.</p>
  </section>;
}
