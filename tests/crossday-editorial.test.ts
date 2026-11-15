import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/nov14-nov15-editorial.json';
import { selectDailySignalStories, type DailySignalSelection } from '../lib/email/selection';
import { renderDailySignalEmail } from '../lib/email/render';
import { runDailySignal } from '../lib/email/daily-signal';
import type { Story } from '../types/story';
const now = new Date('2026-11-15T13:10:00Z');
function story(fields: Partial<Story>, index=0): Story {
 return {id:`story-${index}`,title:`Distinct report ${index}`,summary:`Separate development ${index}.`,why_it_matters:`Implication ${index}.`,url:`https://fixture.example/${index}`,source:'The Record',source_type:'reporting',tag:'Business',score:100-index,published_at:'2026-11-14T20:00:00Z',created_at:now.toISOString(),updated_at:now.toISOString(),article_access:'open',...fields};
}
const yesterday:DailySignalSelection={lead:story(fixture['14'].featured[0]),worthKnowing:fixture['14'].featured.slice(1).map((f,i)=>story(f,i+1)),onRadar:[]};
const today:DailySignalSelection={lead:story(fixture['15'].featured[0]),worthKnowing:fixture['15'].featured.slice(1).map((f,i)=>story(f,i+1)),onRadar:fixture['15'].radar.map((f,i)=>story({...f,summary:i===0?fixture['15'].bullets[4]:`Radar summary ${i}`},i+4))};
const bullets=(selection:DailySignalSelection)=>renderDailySignalEmail(selection,now).text.split('Today in brief\n\n')[1].split('\n\nThe lead')[0];
test('received HTML and plain text confirm exact prior-day repeats and Radar-only fifth bullet',()=>{
 assert.equal(fixture['15'].bullets.length,5);
 assert.deepEqual(fixture['15'].htmlBullets,fixture['15'].bullets);
 const repeats=fixture['15'].bullets.filter(b=>fixture['14'].bullets.includes(b));
 assert.deepEqual(repeats,fixture['15'].bullets.slice(3));
 assert.equal(today.worthKnowing[2].summary,fixture['15'].bullets[3]);
 assert.equal(today.onRadar[0].summary,fixture['15'].bullets[4]);
 assert.ok(bullets(today).includes(today.onRadar[0].summary)); // baseline reproduction
});
test('new editions summarize only full features in both formats; all Radar links survive',()=>{
 const rendered=renderDailySignalEmail({...today,briefingVersion:2},now);
 assert.equal((rendered.html.match(/<li /g)||[]).length,4);
 assert.equal((bullets({...today,briefingVersion:2}).match(/• /g)||[]).length,4);
 assert.ok(!bullets({...today,briefingVersion:2}).includes(today.onRadar[0].summary));
 for(const r of today.onRadar){assert.ok(rendered.text.includes(r.url));assert.ok(rendered.html.includes(r.url));}
 assert.equal((bullets(today).match(/• /g)||[]).length,5); // legacy retry keeps original payload
});
const inventory=[today.lead,...today.worthKnowing,...today.onRadar];
test('exact unchanged prior full coverage no longer re-features; links remain eligible for Radar',()=>{
 const selection=selectDailySignalStories(inventory,now.getTime(),yesterday)!;
 assert.ok(selection);const featured=[selection.lead,...selection.worthKnowing];
 assert.ok(!featured.some(s=>s.url===today.worthKnowing[2].url));
 assert.ok(selection.onRadar.some(s=>s.url===today.worthKnowing[2].url));
 assert.equal(selection.briefingVersion,2);
});
test('evolving facts, analysis, headlines and distinct related coverage remain eligible',()=>{
 const old=yesterday.worthKnowing.find(s=>s.url===today.worthKnowing[2].url)!;
 for(const change of [{summary:old.summary+' The mayor has now signed it.'},{why_it_matters:'A new legal challenge changes the implications.'},{title:old.title+' Updated'},{url:'https://therecord.media/new-court-ruling'}]){
  const update={...old,...change,score:1000};
  const selected=selectDailySignalStories([update,...inventory.filter(s=>s.url!==old.url)],now.getTime(),yesterday)!;
  assert.equal(selected.lead.url,update.url);
 }
});
test('timestamp refresh and tracking URL do not make unchanged coverage new; no history means no suppression',()=>{
 const old=today.worthKnowing[2]; const refreshed={...old,url:old.url+'?utm_source=rss',published_at:now.toISOString(),score:1000};
 const pool=[refreshed,...inventory.filter(s=>s.url!==old.url)];
 assert.notEqual(selectDailySignalStories(pool,now.getTime(),yesterday)!.lead.id,old.id);
 assert.equal(selectDailySignalStories(pool,now.getTime())!.lead.id,old.id);
});
test('prior Radar-only coverage may become a full feature; insufficient unseen features fail closed',()=>{
 const prior={...yesterday,lead:story({},50),worthKnowing:[],onRadar:[today.lead]};
 assert.equal(selectDailySignalStories(inventory,now.getTime(),prior)!.lead.id,today.lead.id);
 assert.equal(selectDailySignalStories([yesterday.lead,...yesterday.worthKnowing],now.getTime(),yesterday),null);
});
test('history read failure stops before transport rather than silently reverting to repeated selection',async()=>{
 let sent=false;
 const result=await runDailySignal({now,stories:inventory,sendLog:{loadPreviousSentSelection:async()=>{throw new Error('fixture history failure');},claim:async()=>({claimed:true}),markSent:async()=>{},markFailed:async()=>{}},transport:{send:async()=>{sent=true;throw new Error('must not send');}}});
 assert.equal(result.status,'failed');assert.equal(sent,false);
});
test('saved same-day campaigns bypass history and preserve exact legacy or versioned payloads',async()=>{
 for(const saved of [today,{...today,briefingVersion:2 as const}]){
  let historyReads=0; let payload='';
  const result=await runDailySignal({now,
   config:{apiKey:'fixture',recipient:'owner@example.com',from:'briefing@example.com'},
   sendLog:{loadSelection:async()=>saved,loadPreviousSentSelection:async()=>{historyReads++;throw new Error('must bypass history on retry');},claim:async()=>({claimed:true}),markSent:async()=>{},markFailed:async()=>{}},
   subscriberStore:{listActive:async()=>[],unsubscribe:async()=>{}},
   deliveryLog:{claim:async()=>({claimed:true}),markSent:async()=>{},markFailed:async()=>{}},
   transport:{send:async message=>{payload=message.text;return {id:'fixture-message'};}}
  });
  assert.equal(result.status,'sent');assert.equal(historyReads,0);
  assert.equal(payload,renderDailySignalEmail(saved,now).text);
 }
});
test('yesterday’s sole fresh repeated feature cannot authorize an otherwise stale issue',()=>{
 const fresh=story({},90);
 const stale=Array.from({length:4},(_,i)=>story({published_at:new Date(now.getTime()-(26+i)*3600000).toISOString()},100+i));
 const previous={lead:fresh,worthKnowing:[],onRadar:[]};
 assert.equal(selectDailySignalStories([fresh,...stale],now.getTime(),previous),null);
});
test('a stale high-scoring lead cannot pass merely because another eligible item is fresh',()=>{
 const stale=story({score:1000,published_at:new Date(now.getTime()-26*3600000).toISOString()},500);
 assert.equal(selectDailySignalStories([stale,...inventory],now.getTime()),null);
});
