import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createSupabaseDailySignalSendLog } from '../lib/email/send-log';
import { selectDailySignalStories, type DailySignalSelection } from '../lib/email/selection';
import type { Story } from '../types/story';
const now=Date.parse('2026-11-17T13:10:00Z');
const make=(id:number,hours=5):Story=>({id:String(id),title:`Distinct report ${id}`,url:`https://example.org/${id}`,source:'The Record',source_type:'reporting',summary:`Development ${id}.`,why_it_matters:`Implication ${id}.`,tag:'Business',score:40-id,article_access:'open',published_at:new Date(now-hours*3600000).toISOString(),created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()});
const old={...make(1,50),score:99};
const snapshot:DailySignalSelection={lead:old,worthKnowing:[make(20,51),make(21,52),make(22,53)],onRadar:[]};
type Row={local_date:string;status:string;selection_snapshot:DailySignalSelection|null};
function mock(t:TestContext,rows:Row[]){
 const savedUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,savedKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
 t.after(()=>{if(savedUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=savedUrl;if(savedKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=savedKey;});
 const requests:URL[]=[];
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
  const url=new URL(input instanceof Request?input.url:String(input));requests.push(url);
  let selected=rows.filter(row=>url.searchParams.getAll('local_date').every(filter=>{const [op,date]=filter.split('.');return op==='eq'?row.local_date===date:op==='lt'?row.local_date<date:op==='gte'?row.local_date>=date:false;})&&url.searchParams.get('status')===`eq.${row.status}`);
  if(url.searchParams.get('order')==='local_date.desc')selected.sort((a,b)=>b.local_date.localeCompare(a.local_date));
  const limit=url.searchParams.get('limit');if(limit)selected=selected.slice(0,Number(limit));
  return new Response(JSON.stringify(selected.map(({selection_snapshot})=>({selection_snapshot}))),{headers:{'Content-Type':'application/json'}});
 });return {log:createSupabaseDailySignalSendLog(),requests};
}
test('a skipped calendar day cannot erase unchanged full-feature history',async t=>{
 const {log}=mock(t,[{local_date:'2026-11-15',status:'sent',selection_snapshot:snapshot}]);
 const history=await log.loadPreviousSentSelection!('2026-11-17');assert.deepEqual(history,snapshot);
 const pool=[{...make(0),score:100},old,make(2),make(3),make(4),make(5)];
 assert.ok(selectDailySignalStories(pool,now)!.worthKnowing.some(s=>s.id===old.id));
 const selected=selectDailySignalStories(pool,now,history)!;assert.ok(selected);
 assert.ok(!selected.worthKnowing.some(s=>s.id===old.id));assert.ok(selected.onRadar.some(s=>s.id===old.id));
 const evolving={...old,summary:old.summary+' A new ruling changes the outcome.'};
 assert.ok(selectDailySignalStories(pool.map(s=>s.id===old.id?evolving:s),now,history)!.worthKnowing.some(s=>s.id===old.id));
});
test('query chooses latest earlier sent edition, ignoring current/future and unfinished campaigns',async t=>{
 const newer={...snapshot,lead:make(8)};
 const {log,requests}=mock(t,[{local_date:'2026-11-14',status:'sent',selection_snapshot:snapshot},{local_date:'2026-11-15',status:'sent',selection_snapshot:newer},{local_date:'2026-11-16',status:'failed',selection_snapshot:snapshot},{local_date:'2026-11-16',status:'sending',selection_snapshot:snapshot},{local_date:'2026-11-17',status:'sent',selection_snapshot:snapshot},{local_date:'2026-11-18',status:'sent',selection_snapshot:snapshot}]);
 assert.deepEqual(await log.loadPreviousSentSelection!('2026-11-17'),newer);
 assert.equal(requests.length,1);assert.equal(requests[0].searchParams.get('limit'),'1');
});
test('history lookup is bounded and does not revive coverage outside retained inventory',async t=>{
 const {log}=mock(t,[{local_date:'2026-11-13',status:'sent',selection_snapshot:snapshot}]);
 assert.equal(await log.loadPreviousSentSelection!('2026-11-17'),null);
});
test('missing latest sent snapshot fails closed rather than falling back to older history',async t=>{
 const {log}=mock(t,[{local_date:'2026-11-14',status:'sent',selection_snapshot:snapshot},{local_date:'2026-11-15',status:'sent',selection_snapshot:null}]);
 await assert.rejects(log.loadPreviousSentSelection!('2026-11-17'),/snapshot unavailable/);
});
