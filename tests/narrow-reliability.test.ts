import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeStories, sameEvent } from '../lib/dedupe';
import { runIngestionPipeline } from '../lib/pipeline/ingest';
import type { Story } from '../types/story';
const base: Story = {id:'a',title:'Orion unveils Nova home display television speaker launch bundle',summary:'Orion announced the Nova home display television speaker launch bundle in India.',why_it_matters:'Fixture implication.',source:'Fixture Publisher',source_type:'reporting',url:'https://fixture.example/a',published_at:'2026-11-14T09:00:00Z',created_at:'2026-11-14T09:00:00Z',updated_at:'2026-11-14T09:00:00Z',score:90,tag:'AI'};
test('headline containment preserves a roundup with additional developments, in either order',()=>{
 const roundup={...base,id:'roundup',url:'https://fixture.example/roundup',title:'The Download: home devices and research security',summary:'Other reports cover research access and browsing restrictions.',raw_snippet:base.title+' Other reporting covers distinct research events.'};
 for(const stories of [[base,roundup],[roundup,base]]) {const before=JSON.stringify(stories);assert.deepEqual(dedupeStories(stories).map(s=>s.id),stories.map(s=>s.id));assert.equal(JSON.stringify(stories),before);}
 assert.deepEqual(dedupeStories([base,roundup,{...roundup,id:'tracked',url:roundup.url+'?utm_source=rss'}]).map(s=>s.id),['a','roundup']);
});
test('uncertain roundup scope is not equivalent solely because a headline is present',()=>{
 assert.equal(dedupeStories([base,{...base,id:'b',url:'https://fixture.example/b',title:'The Download: new developments',summary:'',raw_snippet:base.title}]).length,2);
});
test('invalid event timestamps fail closed; established duplicates still prefer accessible coverage',()=>{
 for(const timestamp of ['', 'invalid']) {const other={...base,id:'b',url:'https://fixture.example/b',published_at:timestamp};assert.equal(sameEvent(base,other),false);assert.equal(sameEvent(other,base),false);}
 assert.deepEqual(dedupeStories([{...base,article_access:'subscription'},{...base,id:'open',url:'https://fixture.example/open',article_access:'open'}]).map(s=>s.id),['open']);
});
const title='OpenAI announces a major artificial intelligence model for consumers';
const summary='OpenAI announced a new artificial intelligence model with improved reasoning and consumer access. The launch expands the capabilities available to people using its chatbot and changes competition across the AI market.';
const valid=()=>`<item><title>${title}</title><link>https://news.example/valid</link><pubDate>${new Date().toUTCString()}</pubDate><description>${summary}</description></item>`;
const feed=(items:string)=>`<rss version="2.0"><channel><title>Offline fixture</title><link>https://news.example</link><description>Fixture</description>${items}</channel></rss>`;
async function ingest(xml:string){const saved=global.fetch;global.fetch=async()=>new Response(xml);try{return await runIngestionPipeline();}finally{global.fetch=saved;}}
test('malformed structured required fields reject only the item, preserving valid siblings',async()=>{
 for(const field of ['title','link','pubDate']){
 const malformed=valid().replace(new RegExp(`<${field}>[\\s\\S]*?</${field}>`),`<${field}><unexpected>not a scalar</unexpected></${field}>`);
 const result=await ingest(feed(malformed+valid()));const source=result.sourceResults.find(s=>s.source.name==='OpenAI')!;
 assert.equal(source.error,null,field);assert.equal(source.pulledCount,2);assert.equal(source.invalidCount,1);assert.equal(source.normalized.length,1);
 }
});
test('structured optional content cannot displace a usable text description',async()=>{
 const xml=valid().replace('</item>','<content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"><unexpected>not text</unexpected></content:encoded></item>');
 const source=(await ingest(feed(xml))).sourceResults.find(s=>s.source.name==='OpenAI')!;
 assert.equal(source.error,null);assert.equal(source.normalized[0].raw_snippet,summary);
});
test('RSS and Atom remain compatible; malformed XML still fails rather than silently succeeding',async()=>{
 const atom=`<feed xmlns="http://www.w3.org/2005/Atom"><title>Fixture</title><entry><title>${title}</title><link href="https://news.example/valid"/><published>${new Date().toISOString()}</published><content type="html">&lt;p&gt;${summary}&lt;/p&gt;</content></entry></feed>`;
 for(const xml of [feed(valid()),atom]){const source=(await ingest(xml)).sourceResults.find(s=>s.source.name==='OpenAI')!;assert.equal(source.error,null);assert.equal(source.normalized[0].raw_snippet,summary);}
 assert.ok((await ingest('<rss><channel><item>')).sourceResults.every(s=>s.error&&s.normalized.length===0));
});
test('source exclusions survive malformed-feed handling and stale/future dates remain rejected',async()=>{
 const dated=(hours:number)=>valid().replace(/<pubDate>.*?<\/pubDate>/,`<pubDate>${new Date(Date.now()+hours*3600000).toUTCString()}</pubDate>`);
 const result=await ingest(feed(dated(2)+dated(-100)+valid()));const source=result.sourceResults.find(s=>s.source.name==='OpenAI')!;
 assert.equal(source.error,null);assert.equal(source.invalidCount,2);assert.equal(source.normalized.length,1);
 assert.ok(result.sourceResults.every(s=>!['The Verge','WIRED','Ars Technica'].includes(s.source.name)));
});
