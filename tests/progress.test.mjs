import assert from 'node:assert/strict';
import test from 'node:test';
import {deadlinePhase,progressSchedule,progressUpdates,unreadReplies,markRepliesSeen} from '../lib/progress.ts';

const now=Date.parse('2030-01-01T00:00:00Z');
const state={wedding:{id:'wedding-a'},decisions:[
  {id:'menu',title:'Choose the menu',done:false,due_at:'2030-01-02T00:00:00Z'},
  {id:'flowers',title:'Decide on flowers',done:false,due_at:null},
  {id:'music',title:'Choose music',done:true,due_at:'2029-12-31T00:00:00Z'},
],coordination:{vendors:[{id:'florist',name:'Demo florist',active:true},{id:'excluded',name:'Excluded vendor',active:false}],tasks:[
  {id:'proposal',vendor_id:'florist',title:'Send proposal',done:false,due_at:'2030-01-01T12:00:00Z'},
  {id:'ignored',vendor_id:'excluded',title:'Excluded deadline',done:false,due_at:'2029-01-01T00:00:00Z'},
],messages:[{id:'reply-a',vendor_id:'florist',direction:'incoming',created_at:'2030-01-01T00:00:00+00:00',content:'We can offer a garden arrangement.'},
 {id:'draft-a',vendor_id:'florist',direction:'outgoing',status:'draft',created_at:'2030-01-01T01:00:00+00:00',content:'Draft only'}]},
activity:[{id:1,kind:'decision_added',title:'Decision added: Choose the menu',created_at:'2030-01-01T00:30:00+00:00'}]};

test('schedule combines couple and active vendor tasks, placing completed work last',()=>{
  const schedule=progressSchedule(state,now);
  assert.deepEqual(schedule.map(item=>item.id),['vendor:proposal','decision:menu','decision:flowers','decision:music']);
  assert.equal(schedule[0].owner,'Demo florist');
  assert.equal(schedule[1].phase,'due_soon');
  assert.equal(schedule[3].phase,'completed');
  assert.equal(deadlinePhase('2029-12-31T23:59:00Z',false,now),'overdue');
  assert.equal(deadlinePhase('2030-02-01T00:00:00Z',false,now),'scheduled');
});

test('updates show original replies as simulated evidence and never claim drafts were sent',()=>{
  const updates=progressUpdates(state);
  assert.equal(updates[0].title,'Decision added: Choose the menu');
  assert.equal(updates[1].title,'Demo florist replied');
  assert.equal(updates[1].label,'Simulated vendor reply');
  assert.equal(updates[1].detail,'We can offer a garden arrangement.');
  assert.equal(updates.length,2);
});

test('new-reply markers survive reload, stay wedding-scoped, and notice the next reply',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  assert.equal(unreadReplies(state,storage),1);
  markRepliesSeen(state,storage);
  assert.equal(unreadReplies(state,storage),0);
  assert.equal(unreadReplies({...state,wedding:{id:'wedding-b'}},storage),1);
  const next=structuredClone(state);
  next.coordination.messages.push({...next.coordination.messages[0],id:'reply-b'});
  assert.equal(unreadReplies(next,storage),1);
});
