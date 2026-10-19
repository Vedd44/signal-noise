import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDailySignalEmail } from '../lib/email/render';
import { SITE_URL } from '../lib/site';
import type { Story } from '../types/story';
const date = new Date('2026-10-16T12:10:00Z');
const story: Story = { id: 'lead', title: 'A useful development', url: 'https://publisher.example/story', source: 'Example', source_type: 'reporting', published_at: date.toISOString(), summary: 'What happened.', why_it_matters: 'Why it matters.', tag: 'AI', score: 90, created_at: date.toISOString(), updated_at: date.toISOString() };
for (const expanded of [false, true]) for (const unsubscribeUrl of [undefined, 'https://www.signalbrief.xyz/daily-signal/unsubscribe?token=fixture&mode=test']) {
 test(`latest CTA preserves email content; expanded=${expanded}, unsubscribe=${Boolean(unsubscribeUrl)}`, () => {
  const selection = { lead: story, worthKnowing: expanded ? [{...story,id:'worth',article_access:'subscription' as const}] : [], onRadar: expanded ? [{...story,id:'radar',article_access:'registration' as const}] : [] };
  const actual = renderDailySignalEmail(selection,date,unsubscribeUrl);
  assert.equal(actual.subject, 'The Signal | October 16');
  assert.equal(actual.preheader, 'The stories worth knowing today.');
  for (const output of [actual.html, actual.text]) {
   for (const content of [story.title, story.summary, story.why_it_matters, story.url]) assert.ok(output.includes(content));
   assert.ok(!output.includes('Read the full briefing'));
   assert.equal(output.includes('Unsubscribe'), Boolean(unsubscribeUrl));
   if (expanded) { assert.ok(output.includes('Subscription required')); assert.ok(output.includes('Free account required')); }
  }
  assert.equal(actual.html.split('Read the latest briefing →').length - 1, 1);
  assert.equal(actual.text.split('Read the latest briefing →').length - 1, 1);
  assert.match(actual.html, new RegExp(`href="${SITE_URL}/"[^>]*>Read the latest briefing →`));
  assert.ok(actual.text.includes(`Read the latest briefing →\n${SITE_URL}/`));
 });
}
