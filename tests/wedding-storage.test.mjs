import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { emptyBrief, readStoredBrief } from '../lib/wedding.ts';
import { parsePersonality } from '../lib/personality.ts';
import { PERSONALITY_STORAGE, BRIEF_STORAGE, readLocalBrief, persistLocalBrief, briefsMatch } from '../lib/wedding-storage.ts';

const profile = JSON.parse(readFileSync(new URL('./fixtures/personality-v3.json', import.meta.url)));
const brief = { ...structuredClone(emptyBrief), names:'Test couple', guests:'80', budget:'20000', location:'Singapore', personality:profile };
function storage(values = {}) {
  const records = new Map(Object.entries(values));
  return { getItem:key=>records.get(key) ?? null, setItem:(key,value)=>records.set(key,value) };
}

test('planner imports every v3 quiz choice instead of an outdated legacy snapshot', () => {
  const local = storage({
    [PERSONALITY_STORAGE]:JSON.stringify({profile,brief:{...brief,personality:undefined},step:2,seed:42,rounds:{palette:9}}),
    [BRIEF_STORAGE]:JSON.stringify({...brief,personality:undefined,names:'Older snapshot'}),
  });
  assert.deepEqual(readLocalBrief(local), brief);
  assert.deepEqual(parsePersonality(profile), profile);
  const change = structuredClone(brief);
  change.personality.worlds.pop();
  assert.equal(briefsMatch(brief,change),false);
  change.personality=structuredClone(brief.personality);
  change.personality.signatures=change.personality.signatures.filter(idea=>idea.kind!=='palette');
  assert.equal(briefsMatch(brief,change),false);
});

test('server replies update both browser records and preserve quiz discovery progress', () => {
  const local=storage({[PERSONALITY_STORAGE]:JSON.stringify({profile,brief,seed:42,step:2,rounds:{palette:9}})});
  const updated={...brief,guests:'120',notes:'No scented flowers'};
  persistLocalBrief(local,updated);
  assert.deepEqual(readLocalBrief(local),updated);
  const record=JSON.parse(local.getItem(PERSONALITY_STORAGE));
  assert.deepEqual(record.profile,profile);
  assert.equal(record.seed,42);
  assert.equal(record.rounds.palette,9);
  assert.deepEqual(JSON.parse(local.getItem(BRIEF_STORAGE)),updated);
});

test('legacy briefs migrate without losing decor and damaged v3 drafts can use the mirror', () => {
  const legacy={...brief,personality:undefined,style:'coastal',direction:'beach-1',decor:{florals:'Wildflowers',lighting:'Lanterns',tables:'Long tables'}};
  const local=storage({[PERSONALITY_STORAGE]:'invalid JSON',[BRIEF_STORAGE]:JSON.stringify(legacy)});
  const migrated=readLocalBrief(local);
  assert.equal(migrated.style,'beach');
  assert.equal(migrated.decor.lighting,'Lanterns');
  assert.deepEqual(migrated.personality,emptyBrief.personality);
  assert.ok(briefsMatch(migrated,readStoredBrief(legacy)));
});

test('rejected planning edits leave both saved snapshots and all quiz choices untouched', () => {
  const local=storage({[PERSONALITY_STORAGE]:JSON.stringify({profile,brief,step:2,seed:42})});
  persistLocalBrief(local,brief);
  const before=[local.getItem(PERSONALITY_STORAGE),local.getItem(BRIEF_STORAGE)];
  for (const change of [{guests:'-1'}, {guests:'1e2'}, {budget:'5.999'}, {budget:'1000000000.01'}]) {
    assert.throws(()=>persistLocalBrief(local,{...brief,...change}));
    assert.deepEqual([local.getItem(PERSONALITY_STORAGE),local.getItem(BRIEF_STORAGE)],before);
    assert.deepEqual(readLocalBrief(local),brief);
  }
  persistLocalBrief(local,{...brief,guests:'120',budget:'24000.50'});
  assert.equal(readLocalBrief(local).guests,'120');
  assert.deepEqual(readLocalBrief(local).personality,profile);
});

test('older invalid auto-saved details become unknown without dropping valid details or the personality', () => {
  for (const key of [PERSONALITY_STORAGE,BRIEF_STORAGE]) {
    const damaged={...brief,guests:'-1',budget:'5.999'};
    const value=key===PERSONALITY_STORAGE?{profile,brief:damaged,seed:42}:damaged;
    const restored=readLocalBrief(storage({[key]:JSON.stringify(value)}));
    assert.equal(restored.guests,'');
    assert.equal(restored.budget,'');
    assert.equal(restored.names,brief.names);
    assert.equal(restored.location,brief.location);
    assert.deepEqual(restored.personality,profile);
    const partial=readStoredBrief({...brief,guests:'-1'});
    assert.equal(partial.budget,brief.budget);
  }
});
