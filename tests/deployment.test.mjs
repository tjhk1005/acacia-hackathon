import assert from 'node:assert/strict';
import test from 'node:test';
import {planningBackendOrigin} from '../lib/deployment.ts';

const demo='https://example-demo.trycloudflare.com';
test('local development uses loopback while Vercel uses the temporary gateway',()=>{
  assert.equal(planningBackendOrigin(undefined,false,demo),'http://127.0.0.1:8000');
  assert.equal(planningBackendOrigin(undefined,true,demo),demo);
  assert.equal(planningBackendOrigin('http://127.0.0.1:8000',true,demo),demo);
});
test('an explicitly hosted backend takes priority and invalid deployment URLs fail clearly',()=>{
  assert.equal(planningBackendOrigin('https://backend.example.com/',true,demo),'https://backend.example.com');
  assert.throws(()=>planningBackendOrigin('http://backend.example.com',true,demo));
  assert.throws(()=>planningBackendOrigin('https://backend.example.com/api',true,demo));
  assert.throws(()=>planningBackendOrigin(undefined,true,'http://localhost:8000'));
  assert.throws(()=>planningBackendOrigin('https://user:secret@backend.example.com',true,demo));
});
