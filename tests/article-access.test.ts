import test from 'node:test';
import assert from 'node:assert/strict';
import { detectArticleAccess, getArticleAccessLabel } from '../lib/article-access';
import { organizeBriefingStories } from '../lib/briefing';
import { dedupeStories } from '../lib/dedupe';
import { renderDailySignalEmail } from '../lib/email/render';
import type { Story } from '../types/story';
const story = (id: string, score: number, source = '404 Media', article_access: Story['article_access'] = 'subscription'): Story => ({id, score, source, article_access, source_type:'reporting', title:'Meta agent security failures expose internal data to outside attackers',summary:'Meta agent security failures expose internal data to outside attackers.',why_it_matters:'Account permissions make isolation failures consequential.',tag:'AI',url:`https://example.com/${id}`,published_at:new Date().toISOString(),created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
test('article structured data identifies paid and free reporting without assuming publisher-wide access', () => {
 assert.equal(detectArticleAccess('<script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","isAccessibleForFree":false}]}</script>'),'subscription');
 assert.equal(detectArticleAccess('<script type="application/ld+json">{"@type":"Article","isAccessibleForFree":true}</script>'),'open');
 assert.equal(detectArticleAccess('<script type="application/ld+json">{"@type":"Organization","isAccessibleForFree":false}</script>'),'unknown');
 assert.equal(detectArticleAccess('<article>News about subscription pricing</article>'),'unknown');
 assert.equal(detectArticleAccess('<div class="content-cta"><h2>This post is for paid subscribers only</h2></div>'),'subscription');
 assert.equal(detectArticleAccess('<div class="content-cta"><h2>Sign up to read</h2></div>'),'registration');
 assert.equal(detectArticleAccess('<div class="post-access-cta members"><div class="paid">This post is for paid members only</div><div class="members">Sign up for free access</div></div>'),'registration');
 assert.equal(detectArticleAccess('<div class="post-access-cta paid"><div class="paid">This post is for paid members only</div><div class="members">Sign up for free access</div></div>'),'subscription');
 assert.equal(getArticleAccessLabel(story('free',90,'404 Media','open')),null);
 assert.equal(getArticleAccessLabel(story('unknown',90,'404 Media','unknown')),'May require subscription');
});
test('lead searches the entire pool for accessible reporting within eight points', () => {
 const candidates=[story('paid',95),story('paid2',94),story('paid3',93),story('free',90,'TechCrunch','open')];
 assert.equal(organizeBriefingStories(candidates,'All').leadStory?.id,'free');
 assert.equal(organizeBriefingStories([story('exceptional',99),story('free',90,'TechCrunch','open')],'All').leadStory?.id,'exceptional');
});
test('comparable duplicate coverage prefers an accessible source without deleting stronger distinct coverage',()=>{
 assert.equal(dedupeStories([story('paid',95),story('free',94,'TechCrunch','open')])[0].id,'free');
 assert.equal(dedupeStories([story('paid',95),story('weak',80,'TechCrunch','open')])[0].id,'paid');
});
test('email HTML and text explain access for featured and radar stories',()=>{
 const paid=story('paid',95); const rendered=renderDailySignalEmail({lead:paid,worthKnowing:[story('free',90,'TechCrunch','open')],onRadar:[story('registration',89,'404 Media','registration')]});
 assert.match(rendered.html,/Subscription required/);assert.match(rendered.text,/Subscription required/);assert.match(rendered.html,/Free account required/);assert.match(rendered.text,/Free account required/);
});
