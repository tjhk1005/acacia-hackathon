import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyPlanningRequest } from '../lib/backend-proxy.ts';

function environment(t) {
  const original={BACKEND_URL:process.env.BACKEND_URL,PLANNING_API_URL:process.env.PLANNING_API_URL,VERCEL:process.env.VERCEL};
  const fetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=fetch;for(const [k,v] of Object.entries(original)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  delete process.env.BACKEND_URL;delete process.env.PLANNING_API_URL;delete process.env.VERCEL;
}
test('binding is read at request time and preserves authentication, body, query and status',async t=>{
  environment(t);process.env.VERCEL='1';process.env.BACKEND_URL='https://backend.internal';
  globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://backend.internal/api/weddings/abc?revision=2');assert.equal(options.headers.get('x-wedding-token'),'test-token');assert.equal(options.headers.get('cookie'),null);assert.equal(new TextDecoder().decode(options.body),'{"brief":{}}');return new Response('{"saved":true}',{status:201,headers:{'content-type':'application/json'}})};
  const response=await proxyPlanningRequest(new Request('https://site.test/planning-api/api/weddings/abc?revision=2',{method:'PATCH',headers:{'x-wedding-token':'test-token',cookie:'private=1','content-type':'application/json'},body:'{"brief":{}}'}));
  assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');
  process.env.BACKEND_URL='https://new.internal';globalThis.fetch=async url=>{assert.equal(String(url),'https://new.internal/health');return new Response('{}')};
  assert.equal((await proxyPlanningRequest(new Request('https://site.test/planning-api/health'))).status,200);
});
test('Vercel never falls back to localhost or a manually configured development URL',async t=>{
  environment(t);process.env.VERCEL='1';process.env.PLANNING_API_URL='http://localhost:8000';globalThis.fetch=()=>{throw Error('Must not fetch')};
  assert.equal((await proxyPlanningRequest(new Request('https://site.test/planning-api/health'))).status,503);
});
test('local development fallback, endpoint filtering and upstream failures',async t=>{
  environment(t);globalThis.fetch=async url=>{assert.equal(String(url),'http://127.0.0.1:8000/health');return new Response('{}')};
  assert.equal((await proxyPlanningRequest(new Request('http://site.test/planning-api/health'))).status,200);
  assert.equal((await proxyPlanningRequest(new Request('http://site.test/planning-api/api/inspiration'))).status,404);
  globalThis.fetch=async()=>new Response(null,{status:307,headers:{location:'https://private.internal'}});
  const redirect=await proxyPlanningRequest(new Request('http://site.test/planning-api/health'));assert.equal(redirect.status,502);assert.equal(redirect.headers.get('location'),null);
  globalThis.fetch=async()=>{throw new Error('private connection details')};
  const failure=await proxyPlanningRequest(new Request('http://site.test/planning-api/health'));assert.equal(failure.status,502);assert.ok(!(await failure.text()).includes('private connection'));
});

test('backend routing 404 is distinguished from a missing wedding record',async t=>{
  environment(t);process.env.BACKEND_URL='https://backend.internal';
  globalThis.fetch=async()=>new Response(JSON.stringify({detail:'Not Found'}),{status:404});
  const routing=await proxyPlanningRequest(new Request('https://site.test/planning-api/api/weddings'));
  assert.equal(routing.status,502);assert.equal((await routing.json()).detail.code,'backend_route_not_found');
  globalThis.fetch=async()=>new Response(JSON.stringify({detail:{code:'wedding_not_found'}}),{status:404});
  const missing=await proxyPlanningRequest(new Request('https://site.test/planning-api/api/weddings/old'));
  assert.equal(missing.status,404);assert.equal((await missing.json()).detail.code,'wedding_not_found');
});
