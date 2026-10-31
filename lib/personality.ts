import { visualReferences, type VisualReference } from './visual-references.ts';

export type IdeaKind = 'feeling' | 'world' | 'direction' | 'palette' | 'setting' | 'nature' | 'simplicity';
export type InspirationIdea = {
  id: string; kind: IdeaKind; title: string; description: string; query: string;
  tags: string[]; colors: string[]; referenceId: string;
};
export type PersonalityProfile = {
  version: 3; complete: boolean; words: string;
  feelings: InspirationIdea[]; worlds: InspirationIdea[]; signatures: InspirationIdea[];
};
export const emptyPersonality: PersonalityProfile = { version: 3, complete: false, words: '', feelings: [], worlds: [], signatures: [] };
export const signatureCategories: { id: IdeaKind; label: string; prompt: string }[] = [
  { id: 'direction', label: 'Overall vibe', prompt: 'Keep a few directions. Your wedding can borrow from more than one.' },
  { id: 'palette', label: 'Colour stories', prompt: 'Which colours feel like you? Keep several palettes if you’re still exploring.' },
  { id: 'setting', label: 'Indoors or out', prompt: 'Open skies, a beautiful room, or a little of both?' },
  { id: 'nature', label: 'Nature & texture', prompt: 'From wild greenery to sculptural spaces. Where do you find yourself?' },
  { id: 'simplicity', label: 'Less or more', prompt: 'Quiet and pared back, wonderfully layered, or somewhere between?' },
];

type Seed = { id: string; title: string; description: string; tags: string[] };
const worlds: Seed[] = [
  {id:'garden',title:'Garden gathering',description:'A celebration wrapped in flowers, soft light and open air.',tags:['garden','outdoor','botanical','romantic']},
  {id:'beach',title:'By the sea',description:'A horizon, a breeze and a beautifully unhurried celebration.',tags:['beach','outdoor','botanical','soft']},
  {id:'classic',title:'Timeless romance',description:'A beautiful room, elegant details and a sense of occasion.',tags:['classic','indoor','romantic','abundant']},
  {id:'modern',title:'Modern love',description:'Clean lines and a space that lets the two of you stand out.',tags:['modern','indoor','architectural','minimal']},
  {id:'woodland',title:'Woodland escape',description:'Tall trees, natural textures and your own little world.',tags:['forest','outdoor','botanical','bohemian']},
  {id:'courtyard',title:'Courtyard celebration',description:'An intimate open-air gathering framed by beautiful architecture.',tags:['garden','outdoor','architectural','intimate']},
  {id:'supper',title:'Dinner-party wedding',description:'One wonderful meal and a table of your favourite people.',tags:['classic','indoor','intimate','minimal']},
  {id:'boho',title:'Bohemian daydream',description:'Loose textures, warm tones and a little free-spirited magic.',tags:['bohemian','outdoor','botanical','earthy']},
  {id:'tropical',title:'Tropical hideaway',description:'Lush leaves, vivid flowers and the feeling of a tiny escape.',tags:['tropical','outdoor','botanical','colourful']},
  {id:'estate',title:'An estate affair',description:'An elegant garden, a generous dinner and timeless romance.',tags:['garden','outdoor','classic','abundant']},
  {id:'editorial',title:'Editorial evening',description:'Sculptural shapes and an artful atmosphere with a confident edge.',tags:['modern','indoor','architectural','dramatic']},
  {id:'rustic',title:'Rustic homecoming',description:'Honest materials, warm wood and the feeling of coming home.',tags:['rustic','outdoor','botanical','earthy']},
  {id:'conservatory',title:'Glasshouse romance',description:'A sheltered celebration that still feels close to nature.',tags:['garden','indoor','botanical','romantic']},
  {id:'rooftop',title:'Open-air city soirée',description:'A city evening, warm lights and a contemporary dinner-party mood.',tags:['modern','outdoor','architectural','intimate']},
  {id:'festival',title:'A joyful garden party',description:'Colour, conversation and a celebration that never feels too formal.',tags:['garden','outdoor','playful','colourful']},
  {id:'ballroom',title:'A grand evening',description:'A dramatic room, a little sparkle and a proper celebration.',tags:['classic','indoor','dramatic','abundant']},
  {id:'waterfront',title:'Waterfront supper',description:'An intimate table, golden light and a view across the water.',tags:['beach','outdoor','intimate','rustic']},
  {id:'minimal',title:'Quietly architectural',description:'Thoughtful empty space, sculptural details and nothing unnecessary.',tags:['modern','indoor','architectural','minimal']},
  {id:'cottage',title:'Cottage-garden story',description:'A charming, flower-filled setting with a slightly storybook spirit.',tags:['garden','outdoor','botanical','soft']},
  {id:'lantern',title:'Lantern-lit gathering',description:'A cosy evening with soft shadows and people drawn close together.',tags:['bohemian','outdoor','intimate','soft']},
];
const moods: Seed[] = [
  {id:'romantic',title:'Quietly romantic',description:'Soft light, meaningful moments and the people who know you best.',tags:['romantic','soft','intimate']},
  {id:'joyful',title:'Joyfully colourful',description:'The sound of laughter, a little colour and a day full of life.',tags:['playful','colourful','abundant']},
  {id:'carefree',title:'Barefoot & carefree',description:'An easy breeze, no stiff traditions and room to just be yourselves.',tags:['beach','outdoor','soft']},
  {id:'dramatic',title:'A little main-character magic',description:'A beautiful entrance, a sense of wonder and a night to remember.',tags:['dramatic','classic','abundant']},
  {id:'cosy',title:'Cosy & connected',description:'A long conversation, warm light and the feeling of belonging.',tags:['intimate','soft','romantic']},
  {id:'wild',title:'Wild at heart',description:'Nature doing its thing, loose flowers and nothing too polished.',tags:['botanical','outdoor','bohemian']},
  {id:'considered',title:'Calm & considered',description:'A deep breath, beautiful simplicity and details chosen with intention.',tags:['minimal','modern','soft']},
  {id:'playful',title:'Playfully unexpected',description:'A surprise around every corner and a celebration with personality.',tags:['playful','colourful','modern']},
  {id:'timeless',title:'Timeless & elegant',description:'A lasting kind of beauty, with a little romance and a little ceremony.',tags:['classic','romantic','white']},
  {id:'earthy',title:'Earthy & grounded',description:'Warm, tactile and honest, like the most beautiful version of home.',tags:['rustic','botanical','earthy']},
  {id:'dreamy',title:'Dreamily enchanting',description:'A little storybook wonder and an atmosphere you can get lost in.',tags:['garden','romantic','abundant']},
  {id:'bold',title:'Confident & expressive',description:'Bold choices, interesting contrasts and a day that feels unmistakably yours.',tags:['modern','dramatic','architectural']},
];
const moments = [
  ['a candlelit supper','Candlelit supper','intimate'], ['an open-air celebration','Open-air celebration','outdoor'],
  ['a flower-filled afternoon','Flower-filled afternoon','botanical'], ['a night of dancing','A night of dancing','playful'],
  ['a beautifully simple ceremony','Simple ceremony','minimal'], ['a golden-hour gathering','Golden-hour gathering','soft'],
  ['a vibrant shared feast','Vibrant shared feast','colourful'], ['an elegant evening','Elegant evening','classic'],
  ['a small, meaningful gathering','Small meaningful gathering','intimate'], ['a softly lit garden party','Softly lit garden party','garden'],
];
const colourFamilies = [
  ['Sage','#91a17f','green'],['Ivory','#f3e9d5','white'],['Terracotta','#bd775b','orange'],['Blush','#d8a39d','pink'],
  ['Powder blue','#9eb9c6','blue'],['Ink','#344347','black'],['Butter','#e8cf84','yellow'],['Lilac','#b7a2bd','purple'],
  ['Olive','#7c875d','green'],['Peach','#e8b397','orange'],['Pearl','#e5e2dc','white'],['Rose','#bf7a83','pink'],
  ['Moss','#62755a','green'],['Lavender','#9b8bad','purple'],['Copper','#ad7151','orange'],['Champagne','#cdb58b','gold'],
  ['Sea glass','#90b5ad','green'],['Midnight','#3b4862','blue'],['Berry','#865065','pink'],['Oat','#d2c1a4','brown'],
];
const settingSeeds: Seed[] = [
  {id:'open-sky',title:'Under open skies',description:'The landscape is part of the celebration. Outdoors feels right.',tags:['outdoor','botanical','garden']},
  {id:'beautiful-room',title:'Inside a beautiful room',description:'A sheltered, comfortable space with an atmosphere all its own.',tags:['indoor','architectural','classic']},
  {id:'both',title:'A little of both',description:'An outdoor ceremony and an indoor dinner, or a sheltered terrace.',tags:['indoor','outdoor','garden']},
  {id:'city-room',title:'An intimate city space',description:'A private dining room or a contemporary indoor celebration.',tags:['indoor','modern','intimate']},
  {id:'forest-space',title:'Beneath the trees',description:'Green shade, an open-air ceremony and the feeling of a tiny escape.',tags:['outdoor','forest','botanical']},
  {id:'water-space',title:'Close to the water',description:'A beach, a waterfront terrace or a lakeside gathering.',tags:['outdoor','beach','soft']},
  {id:'glass-room',title:'A sheltered garden',description:'A glasshouse or covered space that keeps nature close.',tags:['indoor','botanical','garden']},
  {id:'urban-open',title:'An open-air city evening',description:'A courtyard or rooftop with a more architectural atmosphere.',tags:['outdoor','modern','architectural']},
];
const natureSeeds: Seed[] = [
  {id:'wild-green',title:'Let nature lead',description:'Loose greenery, organic shapes and a slightly wild feeling.',tags:['botanical','forest','earthy']},
  {id:'built-space',title:'Let the space speak',description:'Architecture, shape and light matter more than lots of foliage.',tags:['architectural','modern','minimal']},
  {id:'natural-texture',title:'Natural & tactile',description:'Wood, linen, woven textures and an honest, earthy atmosphere.',tags:['botanical','rustic','earthy']},
  {id:'balanced-nature',title:'Nature meets clean lines',description:'Some greenery, some structure. A thoughtful balance of both.',tags:['botanical','architectural','modern']},
  {id:'floral-world',title:'A world of flowers',description:'Flowers create the atmosphere: generous, layered and a little immersive.',tags:['botanical','garden','abundant']},
  {id:'sculptural-space',title:'Artful & sculptural',description:'Interesting forms, considered objects and a confident design direction.',tags:['architectural','dramatic','modern']},
];
const simplicitySeeds: Seed[] = [
  {id:'pared-back',title:'Beautifully pared back',description:'Space to breathe. A few thoughtful details are more than enough.',tags:['minimal','modern']},
  {id:'statement',title:'A few statement moments',description:'Keep the backdrop simple, then give one or two details their moment.',tags:['minimal','dramatic']},
  {id:'layered',title:'Softly layered',description:'A little richness, a little texture, with nothing feeling too much.',tags:['abundant','soft','romantic']},
  {id:'more-is-more',title:'More is a little magical',description:'Abundant flowers, full tables and a joyful sense of occasion.',tags:['abundant','dramatic','colourful']},
  {id:'easy',title:'Relaxed & unfussy',description:'Less styling, more atmosphere. It should feel easy to settle into.',tags:['minimal','intimate','rustic']},
  {id:'immersive',title:'An immersive little world',description:'A complete atmosphere that carries through the whole celebration.',tags:['abundant','garden','romantic']},
];

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i=0;i<value.length;i++) hash = Math.imul(hash ^ value.charCodeAt(i),16777619);
  return hash >>> 0;
}
function random(seed: number) {
  let state = seed || 1;
  return () => {state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296;};
}
function choose<T>(items: T[], rng: () => number): T { return items[Math.floor(rng()*items.length)]; }
function unique(items: string[]) {return [...new Set(items)];}
export function referenceFor(idea: InspirationIdea): VisualReference {
  return visualReferences.find(item => item.id === idea.referenceId) ?? visualReferences[0];
}
function matchingReference(tags: string[], excluded: Set<string>, rng: () => number, paletteOnly=false) {
  const environments=tags.filter(tag=>tag==='indoor'||tag==='outdoor');
  const pool = visualReferences.filter(item => !excluded.has(item.id) && (paletteOnly ? item.tags.includes('palette') : !item.tags.includes('palette')) && (environments.length!==1||item.tags.includes(environments[0])));
  const viable = pool.length ? pool : visualReferences.filter(item => !excluded.has(item.id));
  const primaryFamily=tags.find(tag=>['garden','beach','forest','modern','classic','rustic','bohemian','tropical'].includes(tag));
  const scored = viable.map(item => ({item, score:item.tags.filter(tag=>tags.includes(tag)).length*4+(primaryFamily&&item.tags.includes(primaryFamily)?12:0)+(item.source==='pinterest-reference'?8:0)})).sort((a,b)=>b.score-a.score);
  const best = scored.filter(item=>item.score >= (scored[0]?.score ?? 0)-3).slice(0,5);
  const pinterestMatches=best.filter(entry=>entry.item.source==='pinterest-reference');
  return choose(pinterestMatches.length ? pinterestMatches : best.length ? best : scored, rng)?.item ?? visualReferences[0];
}
function palette(rng: () => number, round: number, index: number) {
  const first = choose(colourFamilies,rng); let second = choose(colourFamilies,rng);
  if(first[0]===second[0]) second=colourFamilies[(colourFamilies.indexOf(first)+7)%colourFamilies.length];
  // A new accent shade also lets colour exploration continue without a terminal catalogue page.
  const hue=Math.floor((rng()*360+round*137.508+index*67)%360);
  return {title:`${first[0]} & ${second[0]}`, id:`${first[0]}-${second[0]}-${hue}`, colors:[first[1],second[1],'#f5efe4',`hsl(${hue} 23% 72%)`], tags:[first[2],second[2]]};
}

export function generateIdeas(kind: IdeaKind, round: number, profile: PersonalityProfile, previous: InspirationIdea[] = [], seed=1): InspirationIdea[] {
  const rng=random(stableHash(`${kind}:${round}:${seed}:${profile.words}:${profile.worlds.map(item=>item.id).join('|')}`));
  const excludedPhotos=new Set(previous.map(item=>item.referenceId));
  const excludedIdeas=new Set(previous.map(item=>item.id));
  const semanticKeys=new Set<string>();
  const previousFeelings=new Set(previous.filter(item=>item.kind==='feeling').map(item=>item.id.split(':')[1]));
  const ideas: InspirationIdea[]=[];
  const words=profile.words.toLowerCase();
  const explicitTags=unique([...worlds,...moods].flatMap(item=>item.tags)).filter(tag=>words.includes(tag));
  if(/candle|cosy|cozy|dinner/.test(words))explicitTags.push('intimate');
  if(/dark|bold|gothic/.test(words))explicitTags.push('dramatic','black');
  const preferenceTags=unique([...profile.feelings.flatMap(item=>item.tags),...explicitTags]);
  const orderedWorlds=[...worlds].sort((a,b)=>b.tags.filter(tag=>preferenceTags.includes(tag)).length-a.tags.filter(tag=>preferenceTags.includes(tag)).length);
  const sourceWorlds=kind!=='world'&&profile.worlds.length ? worlds.filter(item=>profile.worlds.some(world=>world.tags.some(tag=>item.tags.includes(tag)))) : worlds;
  for(let attempt=0;ideas.length<4 && attempt<300;attempt++) {
    const index=ideas.length;
    const colours=palette(rng,round,index);
    const mood=round===0&&kind==='feeling' ? moods[index] : choose(moods,rng);
    const moment=choose(moments,rng);
    const base=kind==='world' && round===0 ? (preferenceTags.length ? orderedWorlds[attempt%orderedWorlds.length] : worlds[attempt%worlds.length]) : choose(sourceWorlds.length ? sourceWorlds : worlds,rng);
    const semanticKey=kind==='feeling'?mood.id:kind==='world'?base.tags[0]:kind==='direction'?base.id:'';
    if(semanticKey&&semanticKeys.has(semanticKey))continue;
    if(kind==='feeling'&&round>0&&previousFeelings.has(mood.id))continue;
    let title=''; let description=''; let tags:string[]=[]; let id='';
    if(kind==='feeling') {
      title=round===0 ? mood.title : `${mood.title} · ${moment[1].toLowerCase()}`;
      description=round===0 ? mood.description : `${mood.description} Imagine ${moment[0]}, with ${colours.title.toLowerCase()} as a starting point.`;
      tags=unique([...mood.tags,moment[2],...colours.tags]); id=`feeling:${mood.id}:${moment[1]}:${colours.id}`;
    } else if(kind==='world' || kind==='direction') {
      const moodLabel:Record<string,string>={romantic:'Romantic',joyful:'Colourful',carefree:'Carefree',dramatic:'Dramatic',cosy:'Intimate',wild:'Wild',considered:'Considered',playful:'Playful',timeless:'Elegant',earthy:'Earthy',dreamy:'Enchanted',bold:'Bold'};
      title=kind==='world'&&round===0 ? base.title : `${moodLabel[mood.id]} ${base.title.toLowerCase()}`;
      description=`${base.description} ${kind==='direction' ? `Try ${colours.title.toLowerCase()} with ${moment[0]}.` : ''}`.trim();
      tags=unique([...base.tags,...mood.tags.filter(tag=>!['indoor','outdoor'].includes(tag)),...colours.tags]); id=`${kind}:${base.id}:${mood.id}:${colours.id}:${moment[1]}`;
    } else if(kind==='palette') {
      title=colours.title; description=`A colour story to borrow from, blend or keep alongside another favourite. ${moment[1]} gives it a different atmosphere.`;
      tags=unique(['palette',...colours.tags]);id=`palette:${colours.id}`;
    } else {
      const sources=kind==='setting' ? settingSeeds : kind==='nature' ? natureSeeds : simplicitySeeds;
      const baseTrait=round===0 ? sources[index%sources.length] : choose(sources,rng);
      title=round===0 ? baseTrait.title : `${baseTrait.title} · ${colours.title.toLowerCase()}`;
      description=baseTrait.description;
      tags=unique([...baseTrait.tags,...colours.tags]);id=`${kind}:${baseTrait.id}:${colours.id}:${moment[1]}`;
      if(ideas.some(item=>item.title.split(' · ')[0]===title.split(' · ')[0])) continue;
    }
    if(excludedIdeas.has(id)||ideas.some(item=>item.id===id||item.title===title)||previous.some(item=>item.title===title)) continue;
    const reference=matchingReference(tags,excludedPhotos,rng,kind==='palette');
    excludedPhotos.add(reference.id);
    if(semanticKey)semanticKeys.add(semanticKey);
    const query=`${title} ${kind==='feeling'&&round===0 ? moment[1] : ''} wedding ${kind==='palette'?'colour palette inspiration':'inspiration'}`.replace(/\s+/g,' ').replace(/\bwedding wedding\b/gi,'wedding').slice(0,240);
    ideas.push({id,kind,title,description,query,tags,colors:colours.colors,referenceId:reference.id});
  }
  return ideas;
}

export function toggleIdea(items: InspirationIdea[], idea: InspirationIdea): InspirationIdea[] {
  return items.some(item=>item.id===idea.id) ? items.filter(item=>item.id!==idea.id) : [...items,idea];
}
export function profileQuery(profile: PersonalityProfile): string {
  const groups=[profile.words,profile.feelings[0]?.title,profile.worlds[0]?.title,
    ...['palette','setting','nature','simplicity'].map(kind=>profile.signatures.find(item=>item.kind===kind)?.title)];
  return `${groups.filter(Boolean).join(' ')} wedding inspiration`.slice(0,240);
}

export function visionReferences(profile: PersonalityProfile): VisualReference[] {
  const all=[...profile.feelings,...profile.worlds,...profile.signatures];
  const taste=unique(all.flatMap(item=>item.tags));
  const settings=unique(profile.signatures.filter(item=>item.kind==='setting').flatMap(item=>item.tags.filter(tag=>tag==='indoor'||tag==='outdoor')));
  const simplicity=unique(profile.signatures.filter(item=>item.kind==='simplicity').flatMap(item=>item.tags.filter(tag=>tag==='minimal'||tag==='abundant')));
  const nature=unique(profile.signatures.filter(item=>item.kind==='nature').flatMap(item=>item.tags.filter(tag=>tag==='botanical'||tag==='architectural')));
  const palettes=unique(profile.signatures.filter(item=>item.kind==='palette').flatMap(item=>item.tags));
  const kept=new Set(all.map(item=>item.referenceId));
  return visualReferences.filter(item=> {
    if(item.tags.includes('palette')) return false;
    if(settings.length===1&&!item.tags.includes(settings[0]))return false;
    if(simplicity.length===1&&!item.tags.includes(simplicity[0]))return false;
    if(nature.length===1&&!item.tags.includes(nature[0]))return false;
    return item.tags.some(tag=>taste.includes(tag));
  }).map(item=>({item,score:item.tags.filter(tag=>taste.includes(tag)).length*3+item.tags.filter(tag=>palettes.includes(tag)).length*4+(kept.has(item.id)?5:0)+(item.source==='pinterest-reference'?1:0)}))
    .sort((a,b)=>b.score-a.score).slice(0,10).map(item=>item.item);
}

export function parsePersonality(value: unknown): PersonalityProfile | null {
  if(!value||typeof value!=='object') return null;
  const saved=value as Record<string,unknown>;
  if(saved.version!==3||typeof saved.words!=='string'||typeof saved.complete!=='boolean') return null;
  const parseIdeas=(data:unknown, allowed:IdeaKind[]):InspirationIdea[]|null=> {
    if(!Array.isArray(data))return null;
    const result:InspirationIdea[]=[];
    for(const raw of data) {
      if(!raw||typeof raw!=='object')return null;
      const item=raw as Record<string,unknown>;
      if(!allowed.includes(item.kind as IdeaKind)||!['id','title','description','query','referenceId'].every(key=>typeof item[key]==='string')||!Array.isArray(item.tags)||!item.tags.every(tag=>typeof tag==='string')||!Array.isArray(item.colors)||!item.colors.every(color=>typeof color==='string'))return null;
      if(!visualReferences.some(reference=>reference.id===item.referenceId))return null;
      if(!result.some(other=>other.id===item.id))result.push(item as unknown as InspirationIdea);
    }
    return result;
  };
  const feelings=parseIdeas(saved.feelings,['feeling']); const worlds=parseIdeas(saved.worlds,['world']);
  const signatures=parseIdeas(saved.signatures,['direction','palette','setting','nature','simplicity']);
  if(!feelings||!worlds||!signatures)return null;
  const complete=saved.complete&&(feelings.length>0||Boolean(saved.words.trim()))&&worlds.length>0&&signatures.length>0;
  return {version:3,complete,words:saved.words.slice(0,500),feelings,worlds,signatures};
}
