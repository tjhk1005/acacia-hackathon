import assert from 'node:assert/strict';
import test from 'node:test';
import { briefsMatch, planningRequest, PlanningError } from '../lib/planning-api.ts';

const brief = { names:'Alex & Sam', date:'', flexibleDate:true, location:'Singapore', guests:'80', budget:'20000', keywords:'', style:'garden', direction:'garden-0', decor:{florals:'White roses',lighting:'Candles',tables:'Round tables'}, priorities:[], notes:'Halal food' };

test('brief comparison preserves and detects the visual direction and decor', () => {
  assert.ok(briefsMatch(brief, structuredClone(brief)));
  assert.equal(briefsMatch(brief, {...brief, direction:'garden-1'}), false);
  assert.equal(briefsMatch(brief, {...brief, decor:{...brief.decor, lighting:'Lanterns'}}), false);
});

test('API client sends the wedding token and preserves retry identifiers', async t => {
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    seen.push({url, options});
    return new Response(JSON.stringify({wedding:{brief}}), {status:200});
  });
  const turn = {message:'100 guests', expected_revision:2, request_id:'same-request'};
  await planningRequest('/api/weddings/example/chat', {id:'example',token:'test-token'}, turn);
  await planningRequest('/api/weddings/example/chat', {id:'example',token:'test-token'}, turn);
  assert.equal(seen[0].url, '/planning-api/api/weddings/example/chat');
  assert.equal(seen[0].options.headers['X-Wedding-Token'], 'test-token');
  assert.equal(seen[0].options.body, seen[1].options.body);
  assert.equal(seen[0].options.method, 'POST');
});

test('unconfigured AI is explained without exposing configuration details', async t => {
  t.mock.method(globalThis,'fetch',async () => new Response(JSON.stringify({detail:{code:'ai_not_configured'}}),{status:503}));
  await assert.rejects(planningRequest('/api/weddings/example/chat'), error => error instanceof PlanningError && error.status === 503 && error.message.includes('edit and save'));
});

test('a revision conflict asks users to refresh rather than reporting a successful save', async t => {
  t.mock.method(globalThis,'fetch',async () => new Response('{}',{status:409}));
  await assert.rejects(planningRequest('/api/weddings/example'), error => error.status === 409 && error.message.includes('brief changed'));
});

test('network failure keeps a retryable error separate from a server validation error', async t => {
  t.mock.method(globalThis,'fetch',async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(planningRequest('/health'), error => error.status === 0 && error.message.includes('unsaved edits are still here'));
});

test('lost wedding is distinguishable from a broken route', async t => {
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({detail:{code:'wedding_not_found'}}),{status:404}));
  await assert.rejects(planningRequest('/api/weddings/old'), e=>e.code==='wedding_not_found'&&e.message.includes('saved wedding vision'));
});
test('missing backend binding is not misreported as missing AI configuration',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({detail:'The backend service binding is unavailable.'}),{status:503}));
  await assert.rejects(planningRequest('/health'),e=>e.status===503&&!e.message.includes('edit and save')&&e.message.includes('planning service'));
});
test('an HTML deployment response never counts as successful wedding creation',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('<html>Not found</html>',{status:200}));
  await assert.rejects(planningRequest('/api/weddings',null,{brief}),e=>e.code==='invalid_backend_response');
});
