import { dedupeStories } from "@/lib/dedupe";
import { publicHttpUrl } from "@/lib/urls";
import { organizeBriefingStories } from "@/lib/briefing";
import { orderStoriesForFeed } from "@/lib/utils";
import type { Story } from "@/types/story";

const ON_RADAR_MINIMUM = 4;
const ON_RADAR_MAXIMUM = 6;
const ON_RADAR_MAX_AGE_HOURS = 72;

export type DailySignalSelection = {
  lead: Story;
  worthKnowing: Story[];
  onRadar: Story[];
};

function getAgeHours(story: Story, now: number) {
  return Math.max(0, (now - Date.parse(story.published_at)) / (1000 * 60 * 60));
}

export function selectDailySignalStories(
  stories: Story[],
  now = Date.now()
): DailySignalSelection | null {
  stories = dedupeStories(stories.filter(story => {
    const published = Date.parse(story.published_at);
    return Number.isFinite(published) && published <= now+5*60_000 && now-published <= 72*3600_000 &&
      publicHttpUrl(story.url) && story.summary.trim() && story.why_it_matters.trim();
  }));
  if (stories.length < 4 || !stories.some(story => now-Date.parse(story.published_at) <= 24*3600_000)) {
    return null;
  }

  const rankedStories = orderStoriesForFeed(stories, now);
  const { leadStory, worthKnowingStories } = organizeBriefingStories(rankedStories, "All");

  if (!leadStory || worthKnowingStories.length < 3) {
    return null;
  }

  const featuredIds = new Set([
    leadStory.id,
    ...worthKnowingStories.map((story) => story.id)
  ]);
  const candidates = rankedStories.filter((story) => {
    return !featuredIds.has(story.id) && getAgeHours(story, now) <= ON_RADAR_MAX_AGE_HOURS;
  });
  const onRadar: Story[] = [];
  const selectedIds = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();

  for (const story of candidates) {
    if (
      (sourceCounts.get(story.source) ?? 0) >= 2 ||
      (topicCounts.get(story.tag) ?? 0) >= 2
    ) {
      continue;
    }

    onRadar.push(story);
    selectedIds.add(story.id);
    sourceCounts.set(story.source, (sourceCounts.get(story.source) ?? 0) + 1);
    topicCounts.set(story.tag, (topicCounts.get(story.tag) ?? 0) + 1);

    if (onRadar.length === ON_RADAR_MAXIMUM) {
      break;
    }
  }

  if (onRadar.length < ON_RADAR_MINIMUM) {
    for (const story of candidates) {
      if (selectedIds.has(story.id)) {
        continue;
      }

      onRadar.push(story);
      selectedIds.add(story.id);

      if (onRadar.length === ON_RADAR_MINIMUM) {
        break;
      }
    }
  }

  return {
    lead: leadStory,
    worthKnowing: worthKnowingStories,
    onRadar
  };
}
