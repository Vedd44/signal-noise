import assert from 'node:assert/strict';
import test from 'node:test';
import { excludedSources, isSourceProcessingAllowed } from '../lib/source-policy';
import { fetchFeedXml } from '../lib/pipeline/ingest';
import { activeRssSources } from '../lib/feeds';
import { hydrateStorySource, hasEnoughEvidence } from '../lib/pipeline/sourceContent';
import { enrichStoryForModel, runEnrichmentPipeline, filterExistingStories, upsertStories } from '../lib/pipeline/enrich';
import { selectDailySignalStories } from '../lib/email/selection';
import { runDailySignal } from '../lib/email/daily-signal';
import type { NormalizedStory, Story } from '../types/story';
const now = new Date('2026-10-23T12:10:00Z');
const candidate: NormalizedStory = {id:'fixture', title:'Synthetic policy test article', source:'The Verge', url:'https://www.theverge.com/fixture', source_type:'reporting', raw_snippet:'Synthetic evidence. '.repeat(40), source_text:'Synthetic article. '.repeat(40), created_at:now.toISOString(), published_at:now.toISOString()};
const story: Story = {...candidate, summary:'Synthetic summary.', why_it_matters:'Synthetic takeaway.', score:90, tag:'AI', updated_at:now.toISOString()};
test('restricted names and exact/subdomain hosts excluded; lookalikes and unresolved sources retained', () => {
 for(const s of excludedSources) {
  assert.equal(isSourceProcessingAllowed(` ${s.name.toUpperCase()} `),false);
  assert.equal(activeRssSources.some(x=>x.name===s.name),false);
  for(const domain of s.domains) {
   assert.equal(isSourceProcessingAllowed('Other',`https://feeds.${domain}/a`),false);
   assert.equal(isSourceProcessingAllowed('Other',`https://${domain}.example/a`),true);
  }
 }
 for(const name of ['404 Media','The New Stack','TechCrunch']) assert.equal(isSourceProcessingAllowed(name),true);
});
test('excluded source hydration clears supplied evidence without network; direct AI helper makes no model request',async()=>{
 const original=globalThis.fetch; let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('Unexpected network');};
 try {
  const result=await hydrateStorySource(candidate);
  assert.equal(result.source_fetch_status,'source-policy-excluded');
  assert.equal(result.source_text,undefined);assert.equal(result.raw_snippet,'');
  assert.equal(hasEnoughEvidence(candidate),false);assert.equal(calls,0);
  const client={responses:{create:async()=>{throw new Error('Unexpected model request');}}};
  const enriched=await enrichStoryForModel(client as unknown as Parameters<typeof enrichStoryForModel>[0],candidate);
  assert.equal(enriched.attempts,0);assert.equal(enriched.usage.requestCount,0);assert.equal(enriched.enrichment,null);
  const batch=await runEnrichmentPipeline([candidate]);assert.equal(batch.submittedCount,0);
  assert.deepEqual((await filterExistingStories([candidate])).storiesToEnrich,[]);
  assert.equal((await upsertStories([story])).insertedCount,0);
 } finally {globalThis.fetch=original;}
});
test('future email excludes restricted stories without mutating archived input',()=>{
 const inventory=Array.from({length:8},(_,i)=>({...story,id:`ok-${i}`,source:`Publisher ${i}`,url:`https://example.com/${i}`,score:80-i}));
 const input=[story,...inventory]; const selection=selectDailySignalStories(input,now.getTime());assert.ok(selection);
 assert.equal([selection.lead,...selection.worthKnowing,...selection.onRadar].some(x=>x.source==='The Verge'),false);
 assert.equal(input[0],story);
});
test('saved restricted issue fails closed before claim, transport, or rewriting send history',async()=>{
 const result=await runDailySignal({now,sendLog:{loadSelection:async()=>({lead:story,worthKnowing:[],onRadar:[]}),claim:async()=>{throw new Error('Must not claim');},markSent:async()=>{throw new Error('Must not write');},markFailed:async()=>{throw new Error('Must not write');}}});
 assert.equal(result.status,'failed');assert.match(result.reason??'',/Saved selection contains a source excluded/);
});
test('next-day fresh inventory still produces an email using mocked transport only',async()=>{
 const tomorrow=new Date('2026-10-24T12:10:00Z');
 const inventory=Array.from({length:8},(_,i)=>({...story,id:`next-${i}`,source:`Publisher ${i}`,url:`https://example.com/${i}`,score:80-i,published_at:tomorrow.toISOString()}));
 let sends=0;
 const result=await runDailySignal({now:tomorrow,stories:[{...story,published_at:tomorrow.toISOString()},...inventory],config:{apiKey:'fixture-only',recipient:'fixture@example.com',from:'Fixture <fixture@example.com>'},sendLog:{claim:async(date)=>{assert.equal(date,'2026-10-24');return {claimed:true};},markSent:async()=>{},markFailed:async()=>{assert.fail('No failure expected');}},subscriberStore:{listActive:async()=>[],unsubscribe:async()=>{}},deliveryLog:{claim:async()=>({claimed:true}),markSent:async()=>{},markFailed:async()=>{}},transport:{send:async(message)=>{sends++;assert.ok(!message.html.includes('theverge.com'));return {id:'fixture'};}}});
 assert.equal(result.status,'sent');assert.equal(sends,1);
});

test('RSS redirects cannot fetch excluded destinations',async()=>{
 const original=globalThis.fetch;const seen:string[]=[];
 globalThis.fetch=async(input,init)=>{seen.push(String(input));assert.equal(init?.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://WWW.WIRED.COM./feed?example=true'}});};
 try {await assert.rejects(fetchFeedXml('https://allowed.example/feed'),/source-policy-excluded/);assert.deepEqual(seen,['https://allowed.example/feed']);}
 finally {globalThis.fetch=original;}
});
test('source host matching ignores case, query and a trailing DNS dot',()=>{
 assert.equal(isSourceProcessingAllowed('Other','https://WWW.WIRED.COM./a?x=theverge.com'),false);
 assert.equal(isSourceProcessingAllowed('Other','https://allowed.example/a?x=theverge.com'),true);
});
