import { getArticleAccessPreference } from "@/lib/article-access";
import type { Story } from '@/types/story';
import { canonicalStoryUrl } from '@/lib/urls';

const STOP_WORDS = new Set('a an the and or to of in on for with from by as is are was were it its at that this has have new says said'.split(' '));
function words(text: string) { return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => w.length > 2 && !STOP_WORDS.has(w))); }
function overlap(left: Set<string>, right: Set<string>) { const common = [...left].filter(w => right.has(w)).length; return { common, ratio: common / Math.max(left.size, right.size, 1) }; }
function normalize(text: string) { return text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }

export function sameEvent(left: Story, right: Story) {
  if (Math.abs(Date.parse(left.published_at)-Date.parse(right.published_at)) > 36*3600_000) return false;
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
    // A publisher's newsletter often republishes the standalone article's full title.
    if (/^the download:/i.test(story.title) && stories.some(other => other.id !== story.id &&
      other.source === story.source && !/^the download:/i.test(other.title) &&
      Math.abs(Date.parse(story.published_at)-Date.parse(other.published_at)) < 24*3600_000 &&
      normalize(story.raw_snippet ?? '').includes(normalize(other.title)))) continue;
    seen.add(url); kept.push(story);
  }
  return kept;
}
