import { getArticleAccessPreference } from "@/lib/article-access";
import type { Story } from '@/types/story';
import { canonicalStoryUrl } from '@/lib/urls';

const STOP_WORDS = new Set('a an the and or to of in on for with from by as is are was were it its at that this has have new says said'.split(' '));
function words(text: string) { return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => w.length > 2 && !STOP_WORDS.has(w))); }
function overlap(left: Set<string>, right: Set<string>) { const common = [...left].filter(w => right.has(w)).length; return { common, ratio: common / Math.max(left.size, right.size, 1) }; }

export function sameEvent(left: Story, right: Story) {
  const leftTime = Date.parse(left.published_at);
  const rightTime = Date.parse(right.published_at);
  // Unknown timestamps cannot establish the bounded event window.
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime) || Math.abs(leftTime-rightTime) > 36*3600_000) return false;
  const title = overlap(words(left.title), words(right.title));
  const summary = overlap(words(left.summary), words(right.summary));
  // Different numbers often distinguish a follow-up, a new round, or a changed price.
  const numbers = (text: string) => [...new Set(text.match(/\d+(?:[.,]\d+)*/g) ?? [])].sort().join(',');
  if (numbers(left.title+' '+left.summary) !== numbers(right.title+' '+right.summary)) return false;
  return title.common >= 6 && title.ratio >= 0.8 && summary.ratio >= 0.65;
}

/** Preserve the preferred ranking and all distinct reporting; never delete stored records. */
export function dedupeStories(stories: Story[]) {
  const seen = new Set<string>();
  const kept: Story[] = [];
  for (const story of stories) {
    const url = canonicalStoryUrl(story.url);
    if (!url || seen.has(url)) continue;
    const duplicate = kept.findIndex(other => sameEvent(story, other));
    if (duplicate >= 0) {
      const existing = kept[duplicate];
      if (story.score >= existing.score - 2 && getArticleAccessPreference(story) > getArticleAccessPreference(existing)) kept[duplicate] = story;
      seen.add(url);
      continue;
    }
    // Headline containment does not establish that a roundup has no other news.
    // Suppress only when URL or sameEvent evidence above supports duplication.
    seen.add(url); kept.push(story);
  }
  return kept;
}
