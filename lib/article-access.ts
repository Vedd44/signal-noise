import { getSourceAccessibility } from '@/lib/feeds';
import type { Story } from '@/types/story';

export type ArticleAccess = 'open' | 'subscription' | 'registration' | 'unknown';

/** Article evidence overrides publisher-level estimates. Missing evidence is never proof of free access. */
export function detectArticleAccess(html: string): ArticleAccess {
  let explicitlyOpen = false;
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const visit = (node: unknown): boolean => {
        if (Array.isArray(node)) return node.some(visit);
        if (!node || typeof node !== 'object') return false;
        const value = node as Record<string, unknown>;
        const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
        if (types.some(type => typeof type === 'string' && /(?:Article|BlogPosting)$/.test(type))) {
          if (value.isAccessibleForFree === false || value.isAccessibleForFree === 'false') return true;
          if (value.isAccessibleForFree === true || value.isAccessibleForFree === 'true') explicitlyOpen = true;
        }
        return value['@graph'] ? visit(value['@graph']) : false;
      };
      if (visit(JSON.parse(match[1]))) return 'subscription';
    } catch { /* Fall back to visible access-gate markup. */ }
  }
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  // Ghost themes may include both paid and free-account copy, hiding the inactive variant.
  // Read the active gate class rather than treating hidden paid-member copy as evidence.
  const themedGate = visible.match(/<[^>]+class=["']([^"']*\bpost-access-cta\b[^"']*)["'][^>]*>/i)?.[1];
  if (themedGate) {
    if (/\bpaid\b/.test(themedGate)) return 'subscription';
    if (/\bmembers\b/.test(themedGate)) return 'registration';
  }
  const gate = visible.match(/<(?:div|section)\b[^>]*class=["'][^"']*\bcontent-cta\b[^"']*["'][^>]*>([\s\S]{0,6000})/i)?.[1];
  if (gate) {
    if (/(?:paid|paying) (?:subscribers|members)|subscribers only|subscribe (?:now|to (?:read|continue))|subscription required/i.test(gate)) return 'subscription';
    if (/sign (?:up|in)|register|members only/i.test(gate)) return 'registration';
  }
  return explicitlyOpen ? 'open' : 'unknown';
}

export function getArticleAccess(story: Pick<Story, 'source' | 'article_access'>): ArticleAccess {
  if (story.article_access && story.article_access !== 'unknown') return story.article_access;
  const source = getSourceAccessibility(story.source);
  return source === 'open' || source === 'mostly_open' ? 'open' : 'unknown';
}

export function getArticleAccessPreference(story: Pick<Story, 'source' | 'article_access'>) {
  const access = getArticleAccess(story);
  return access === 'open' ? 2 : access === 'unknown' ? 1 : 0;
}

export function getArticleAccessLabel(story: Pick<Story, 'source' | 'article_access'>) {
  if (story.article_access === 'subscription') return 'Subscription required';
  if (story.article_access === 'registration') return 'Free account required';
  if (getArticleAccess(story) === 'open') return null;
  const source = getSourceAccessibility(story.source);
  return source === 'unknown' ? null : 'May require subscription';
}
