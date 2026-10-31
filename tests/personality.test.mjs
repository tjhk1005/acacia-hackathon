import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyPersonality, generateIdeas, parsePersonality, toggleIdea, visionReferences } from '../lib/personality.ts';
import { normalisePinterestResponse } from '../lib/pinterest.ts';

const fresh=()=>structuredClone(emptyPersonality);
test('all quiz chapters and signature categories keep rerolling beyond the old eight-option limit',()=>{
  for(const kind of ['feeling','world','direction','palette','setting','nature','simplicity']) {
    let previous=[];
    const seen=new Set();
    for(let round=0;round<100;round++) {
      const next=generateIdeas(kind,round,fresh(),previous,42);
      assert.equal(next.length,4,`${kind} round ${round}`);
      assert.equal(new Set(next.map(item=>item.id)).size,4);
      assert.equal(new Set(next.map(item=>item.referenceId)).size,4);
      if(kind==='feeling')assert.equal(new Set(next.map(item=>item.id.split(':')[1])).size,4,'Feelings should differ in emotion, not just wording');
      if(kind==='world')assert.equal(new Set(next.map(item=>item.tags[0])).size,4,'Worlds should offer distinct settings and styles');
      assert.ok(!next.some(item=>previous.some(old=>old.id===item.id||old.referenceId===item.referenceId)),`${kind}: immediate repeat`);
      for(const idea of next)seen.add(idea.id);
      previous=next;
    }
    assert.ok(seen.size>100,`${kind}: not genuinely exploring beyond eight ideas`);
  }
});

test('kept choices are independent of rerolls and support several preference dimensions',()=>{
  const profile=fresh();
  const feelings=generateIdeas('feeling',0,profile,[],1);
  profile.feelings=toggleIdea(profile.feelings,feelings[0]);
  profile.feelings=toggleIdea(profile.feelings,feelings[1]);
  for(let round=1;round<=20;round++)generateIdeas('feeling',round,profile,feelings,1);
  assert.equal(profile.feelings.length,2);
  for(const kind of ['direction','palette','setting','nature','simplicity']) {
    const ideas=generateIdeas(kind,0,profile,[],1);
    profile.signatures=toggleIdea(profile.signatures,ideas[0]);
    profile.signatures=toggleIdea(profile.signatures,ideas[1]);
  }
  assert.equal(profile.signatures.length,10);
  assert.equal(profile.signatures.filter(item=>item.kind==='palette').length,2);
  profile.feelings=toggleIdea(profile.feelings,feelings[0]);
  assert.equal(profile.feelings.length,1);
});

test('moodboard follows explicit indoor/outdoor and minimal/maximal preferences',()=>{
  const indoor=fresh();
  const settings=generateIdeas('setting',0,indoor,[],1);
  const simplicity=generateIdeas('simplicity',0,indoor,[],1);
  indoor.feelings=generateIdeas('feeling',0,indoor,[],1).slice(0,1);
  indoor.worlds=generateIdeas('world',0,indoor,[],1).slice(0,1);
  indoor.signatures=[settings.find(item=>item.title==='Inside a beautiful room'),simplicity.find(item=>item.title==='Beautifully pared back')];
  const inside=visionReferences(indoor);
  assert.ok(inside.length>0);
  assert.ok(inside.every(item=>item.tags.includes('indoor')&&item.tags.includes('minimal')));
  const outdoor=fresh();
  outdoor.feelings=indoor.feelings;outdoor.worlds=indoor.worlds;
  outdoor.signatures=[settings.find(item=>item.title==='Under open skies'),simplicity.find(item=>item.title==='More is a little magical')];
  const outside=visionReferences(outdoor);
  assert.ok(outside.length>0);
  assert.ok(outside.every(item=>item.tags.includes('outdoor')&&item.tags.includes('abundant')));
  assert.notDeepEqual(inside.map(item=>item.id),outside.map(item=>item.id));
});

test('saved personalities round-trip and reject unknown image references',()=>{
  const profile=fresh();profile.feelings=generateIdeas('feeling',0,profile,[],1).slice(0,2);
  profile.worlds=generateIdeas('world',0,profile,[],1).slice(0,2);
  profile.signatures=generateIdeas('palette',0,profile,[],1).slice(0,2);profile.complete=true;
  assert.deepEqual(parsePersonality(JSON.parse(JSON.stringify(profile))),profile);
  profile.worlds[0].referenceId='https://untrusted.invalid/image';
  assert.equal(parsePersonality(profile),null);
});

test('Pinterest results only accept distinct real Pin IDs and Pinterest image hosts',()=>{
  const pin=(id,url)=>({id,title:'Wedding reference',media:{images:{'600x':{url,width:600}}}});
  const result=normalisePinterestResponse({items:[pin('123','https://i.pinimg.com/736x/test.jpg'),pin('123','https://i.pinimg.com/other.jpg'),pin('bad','https://i.pinimg.com/test.jpg'),pin('456','https://not-pinterest.example/image.jpg'),pin('789','http://i.pinimg.com/test.jpg')]});
  assert.equal(result.length,1);
  assert.equal(result[0].pinterest,'https://www.pinterest.com/pin/123/');
  assert.deepEqual(normalisePinterestResponse({items:null}),[]);
});
