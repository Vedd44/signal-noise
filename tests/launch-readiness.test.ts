import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { readPublicForm, FormError } from '@/lib/public-forms';
import { parseSubmission } from '@/lib/submissions';
import { normalizeSubscriberEmail } from '@/lib/email/subscribers';
import { confirmationTokenHash, renderConfirmationEmail } from '@/lib/email/confirmation';
import { cleanCampaign } from '@/lib/attribution';
import { safeAnalyticsLocation } from '@/lib/analytics';
import { extractReadableSourceText, hydrateStorySource } from '@/lib/pipeline/sourceContent';
import { dedupeStories } from '@/lib/dedupe';
import { publicHttpUrl } from '@/lib/urls';
import { selectDailySignalStories } from '@/lib/email/selection';
import { evaluateExistingDailySignalClaim } from '@/lib/email/send-log';
import { sendEmail } from '@/lib/email/transport';
import { mapConcurrent } from '@/lib/pipeline/concurrency';
import { enrichStoryForModel } from '@/lib/pipeline/enrich';
import type { Story, NormalizedStory } from '@/types/story';

const now = new Date('2026-10-02T18:00:00Z').getTime();
function story(n:number, partial:Partial<Story>={}):Story {return { id:`s-${n}`,title:`Article ${n}`,url:`https://example.com/${n}`,source:'Example',source_type:'reporting',published_at:new Date(now-n*3600000).toISOString(),summary:`Summary ${n}.`,why_it_matters:`Signal ${n}.`,tag:'AI',score:90-n,created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString(),...partial };}
const request=(body:string, headers:Record<string,string>={})=>new NextRequest('https://www.signalbrief.xyz/api/test',{method:'POST',headers:{'content-type':'application/json',...headers},body});

test('public forms reject malformed, oversized, and cross-site requests with specific statuses',async()=>{
  for(const [req,status] of [[request('{'),400],[request('[]'),400],[request(JSON.stringify({request:'x'.repeat(9000)})),413],[request('{}',{origin:'https://attacker.example'}),403],[request('{}',{'content-type':'text/plain'}),415]] as const) {
    await assert.rejects(()=>readPublicForm(req),error=>error instanceof FormError && error.status===status);
  }
  assert.deepEqual(await readPublicForm(request('{"request":"Useful idea"}')), {request:'Useful idea'});
});

test('feedback validates full URLs and input bounds rather than accepting malformed links',()=>{
  for(const url of ['https://','javascript:alert(1)','https://user:pass@example.com','https://127.0.0.1','https://localhost','https://example.com/\n']) assert.equal(publicHttpUrl(url),null);
  assert.throws(()=>parseSubmission('source',{name:'Site',url:'https://'}));
  assert.throws(()=>parseSubmission('feature',{request:'x'.repeat(1001)}));
  assert.deepEqual(parseSubmission('feature',{request:' Useful idea '}),{request:'Useful idea',details:''});
});

test('email validation rejects markup, invalid labels, and malformed local parts',()=>{
  for(const value of ['<reader>@example.com','a..b@example.com','a@example..com','a@-example.com','a\nb@example.com','a'.repeat(65)+'@example.com'])assert.equal(normalizeSubscriberEmail(value),null);
  assert.equal(normalizeSubscriberEmail(' READER+Tag@Example.com '),'reader+tag@example.com');
});

test('confirmation tokens are opaque, hashed, and emails give a clear next step',()=>{
  const token='a'.repeat(64);
  assert.equal(confirmationTokenHash('bad'),null);
  assert.equal(confirmationTokenHash(token)?.length,64);
  assert.notEqual(confirmationTokenHash(token),token);
  const email=renderConfirmationEmail(token);
  assert.match(email.html,/Confirm subscription/);assert.match(email.text,/24 hours/);
  assert.match(email.text,/daily-signal\/confirm\?token=/);
});

test('analytics discards PII and unknown parameters while retaining campaign labels',()=>{
  assert.deepEqual(cleanCampaign({utm_source:'newsletter',utm_campaign:'fall_launch',email:'reader@example.com',token:'secret',utm_term:'reader@example.com'}),{utm_source:'newsletter',utm_campaign:'fall_launch'});
  assert.equal(safeAnalyticsLocation('https://www.signalbrief.xyz/?utm_source=ad&utm_campaign=fall&email=a%40b.com&token=secret#private'),'https://www.signalbrief.xyz/?utm_source=ad&utm_campaign=fall');
});

test('source extraction excludes page chrome and finds nested publisher article bodies',()=>{
  const html='<html><nav>Menu</nav><form>Country list '+ 'noise '.repeat(200)+'</form><div id="tns-post-body-content"><p>Real reporting.</p><div><p>Specific costs and constraints.</p></div></div><footer>Subscribe</footer></html>';
  assert.equal(extractReadableSourceText(html),'Real reporting. Specific costs and constraints.');
  assert.equal(extractReadableSourceText('<html><form>Subscribe now</form><nav>News</nav></html>'),'');
  assert.equal(extractReadableSourceText('<script type="application/ld+json">{"@type":"NewsArticle","articleBody":"Verified article body."}</script>'),'Verified article body.');
});

test('source retrieval rejects unknown hosts and local redirect targets before fetching them',async()=>{
  const previous=global.fetch;let calls=0;
  global.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});};
  try {
    assert.equal((await hydrateStorySource({...story(1),source:'The New Stack',url:'https://attacker.example/a',raw_snippet:''})).source_fetch_status,'untrusted-source-url');
    assert.equal(calls,0);
    assert.equal((await hydrateStorySource({...story(1),source:'The New Stack',url:'https://thenewstack.io/a',raw_snippet:''})).source_fetch_status,'untrusted-source-url');
    assert.equal(calls,1);
  } finally {global.fetch=previous;}
});

test('deduplication removes tracking variants and roundups while keeping distinct follow-ups',()=>{
  const original=story(0,{title:'Acme introduces a new chip for local AI',summary:'Acme announced a chip with 16 gigabytes of memory.'});
  const duplicate=story(1,{...original,id:'duplicate',url:original.url+'?utm_source=rss'});
  const roundup=story(2,{title:'The Download: chips and robots',raw_snippet:original.title+' More reporting.'});
  const followup=story(3,{title:original.title,summary:'Acme announced a chip with 32 gigabytes of memory.'});
  assert.deepEqual(dedupeStories([original,duplicate,roundup,followup]).map(x=>x.id),[original.id,followup.id]);
});

test('daily selection refuses stale, empty, malformed, or incomplete issues',()=>{
  assert.equal(selectDailySignalStories([story(0)],now),null);
  assert.equal(selectDailySignalStories(Array.from({length:6},(_,n)=>story(n,{published_at:new Date(now-80*3600000).toISOString()})),now),null);
  assert.equal(selectDailySignalStories(Array.from({length:4},(_,n)=>story(n,{why_it_matters:''})),now),null);
  assert.ok(selectDailySignalStories(Array.from({length:6},(_,n)=>story(n)),now));
});

test('accepted-but-unrecorded delivery cannot use a changed payload or outlive provider idempotency',()=>{
  assert.equal(evaluateExistingDailySignalClaim({status:'failed',content_hash:'old',attempted_at:'2026-10-02T12:10:00Z'},'new','2026-10-02T12:30:00Z'),'payload-changed');
  assert.equal(evaluateExistingDailySignalClaim({status:'failed',content_hash:'same',attempted_at:'2026-10-01T12:10:00Z'},'same','2026-10-02T12:30:00Z'),'in-progress');
});

test('provider rejection is redacted and requests have a timeout and stable idempotency',async()=>{
  const previous=global.fetch;let options:RequestInit|undefined;
  global.fetch=async(_url,init)=>{options=init;return Response.json({message:'private@example.com'},{status:503});};
  try {
    await assert.rejects(()=>sendEmail('test',{from:'Signal <signal@example.com>',to:['test@example.com'],subject:'Test',html:'<p>Test</p>',text:'Test'},'test-key'), /Email provider failed \(503\)/);
    assert.ok(options?.signal);assert.equal(new Headers(options?.headers).get('Idempotency-Key'),'test-key');
  } finally {global.fetch=previous;}
});

test('bounded concurrency preserves result order and caps simultaneous work',async()=>{
  let active=0,max=0;
  const result=await mapConcurrent([1,2,3,4,5],2,async n=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return n*2;});
  assert.equal(max,2);assert.deepEqual(result,[2,4,6,8,10]);
});

test('OpenAI transport failures retry once and never become public fallback copy',async()=>{
  let calls=0;
  const client={responses:{create:async()=>{calls++;throw Object.assign(new Error('unavailable'),{status:503});}}} as never;
  const result=await enrichStoryForModel(client,{...story(0),raw_snippet:'Source evidence.'} as NormalizedStory);
  assert.equal(calls,2);assert.equal(result.enrichment,null);
});
