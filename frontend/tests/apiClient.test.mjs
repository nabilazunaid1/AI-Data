import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKEND_UNAVAILABLE,readApiResponse,requestJson } from '../src/services/apiClient.js';

test('successful JSON and structured backend errors retain their meaning',async()=>{
  assert.deepEqual(await readApiResponse(Response.json({connections:[]})),{connections:[]});
  await assert.rejects(readApiResponse(Response.json({detail:'Selected source unavailable'},{status:503})),/Selected source unavailable/);
});
test('empty and plain-text proxy errors explain backend availability without parser errors',async()=>{
  for(const body of ['', 'Error: connect ECONNREFUSED 127.0.0.1:8000', '<html>Bad Gateway</html>']){
    await assert.rejects(readApiResponse(new Response(body,{status:500})),error=>error.message===BACKEND_UNAVAILABLE);
  }
});
test('invalid successful responses give a readable error instead of JSON syntax errors',async()=>{
  for(const body of ['', '<html>Unexpected response</html>']){
    await assert.rejects(readApiResponse(new Response(body)),/empty or invalid response/);
  }
});
test('authorization failures include a useful next action',async()=>{
  await assert.rejects(readApiResponse(new Response('',{status:401})),/Access settings/);
  await assert.rejects(readApiResponse(new Response('',{status:403})),/permission/);
});
test('network failures are readable and request cancellation remains cancellation',async t=>{
  const original=globalThis.window;
  t.after(()=>{if(original===undefined)delete globalThis.window;else globalThis.window=original;});
  globalThis.window={location:{origin:'http://127.0.0.1:5173'},fetch:async()=>{throw new TypeError('Failed to fetch');}};
  await assert.rejects(requestJson('/api/v1/connections'),error=>error.message===BACKEND_UNAVAILABLE);
  const cancelled=new DOMException('Request cancelled','AbortError');
  window.fetch=async()=>{throw cancelled;};
  await assert.rejects(requestJson('/api/v1/connections'),error=>error===cancelled);
});
