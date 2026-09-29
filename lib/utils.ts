import type { PublicStoryTopic, Story } from "@/types/story";
import {
  AI_PATTERNS,
  BUSINESS_PATTERNS,
  CONSUMER_TECH_PATTERNS,
  MEDIA_PATTERNS,
  PRODUCT_PATTERNS,
  STRATEGY_PATTERNS,
  getSourcePriorityBoost,
  isPromotionalStory,
  isTechnicalNicheStory,
  normalizeStoryTag
} from "@/lib/scoring";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function createStoryId(source: string, title: string, url: string) {
  const seed = `${source}-${title}-${url}`;
  return slugify(seed);
}

export function isValidIsoDate(value: string) {
  return !Number.isNaN(Date.parse(value));
}

export function sortByPublishedAtDesc<T extends { published_at: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    return Date.parse(right.published_at) - Date.parse(left.published_at);
  });
}

export function formatRelativeTime(isoString: string) {
  const published = new Date(isoString).getTime();
  const now = Date.now();
  const diffMs = published - now;
  const minutes = Math.round(diffMs / (1000 * 60));
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, "minute");
  }

  const hours = Math.round(minutes / 60);

  if (Math.abs(hours) < 24) {
    return formatter.format(hours, "hour");
  }

  const days = Math.round(hours / 24);
  return formatter.format(days, "day");
}

const BREAKING_RELEVANCE_PATTERNS = [
  /\blaunch\b/i,
  /\bunveil\b/i,
  /\bannounce\b/i,
  /\bpartner(ship)?\b/i,
  /\bacqui(sition|re)\b/i,
  /\bpricing\b/i,
  /\bsubscription\b/i,
  /\broll out\b/i,
  /\bsearch\b/i,
  /\bads?\b/i
];

const STRONG_FRESHNESS_WINDOW_HOURS = 6;
const MODERATE_FRESHNESS_WINDOW_HOURS = 24;
const DECAY_WINDOW_HOURS = 48;

function getStorySearchText(story: Story) {
  return `${story.title} ${story.summary} ${story.why_it_matters} ${story.raw_snippet ?? ""}`;
}

export function getStoryTopics(story: Story): PublicStoryTopic[] {
  const text = getStorySearchText(story);
  const topics = new Set<PublicStoryTopic>(["All"]);
  const normalizedTag = normalizeStoryTag(story.tag);

  if (normalizedTag) {
    topics.add(normalizedTag);
  }

  if (AI_PATTERNS.some((pattern) => pattern.test(text))) {
    topics.add("AI");
  }

  if (MEDIA_PATTERNS.some((pattern) => pattern.test(text)) || normalizedTag === "Media") {
    topics.add("Media");
  }

  if (STRATEGY_PATTERNS.some((pattern) => pattern.test(text)) || normalizedTag === "Strategy") {
    topics.add("Strategy");
  }

  if (BUSINESS_PATTERNS.some((pattern) => pattern.test(text)) || normalizedTag === "Business") {
    topics.add("Business");
  }

  if (PRODUCT_PATTERNS.some((pattern) => pattern.test(text)) || normalizedTag === "Product") {
    topics.add("Product");
  }

  if (
    CONSUMER_TECH_PATTERNS.some((pattern) => pattern.test(text)) ||
    normalizedTag === "Consumer Tech"
  ) {
    topics.add("Consumer Tech");
    topics.add("Product");
  }

  return Array.from(topics);
}

export function computeStoryRankScore(story: Story, now = Date.now()) {
  const ageHours = Math.max(0, (now - Date.parse(story.published_at)) / (1000 * 60 * 60));
  const text = getStorySearchText(story);
  const normalizedTag = normalizeStoryTag(story.tag) ?? "Strategy";
  let rank = story.score * 0.72;

  if (ageHours <= STRONG_FRESHNESS_WINDOW_HOURS) {
    rank += 28;
  } else if (ageHours <= MODERATE_FRESHNESS_WINDOW_HOURS) {
    rank += 16;
  } else if (ageHours <= DECAY_WINDOW_HOURS) {
    rank += 2;
  } else if (ageHours <= 72) {
    rank -= 14;
  } else if (ageHours <= 120) {
    rank -= 20;
  } else {
    rank -= Math.min(34, 22 + Math.floor((ageHours - 120) / 24) * 4);
  }

  if (normalizedTag === "AI" || normalizedTag === "Strategy" || normalizedTag === "Business") {
    rank += 3;
  } else if (normalizedTag === "Media" || normalizedTag === "Product") {
    rank += 2;
  } else if (normalizedTag === "Consumer Tech") {
    rank += 1;
  }

  rank += getSourcePriorityBoost(story.source);

  if (BREAKING_RELEVANCE_PATTERNS.some((pattern) => pattern.test(text))) {
    rank += 3;
  }

  if (CONSUMER_TECH_PATTERNS.some((pattern) => pattern.test(text))) {
    rank += 1;
  }

  if (AI_PATTERNS.some((pattern) => pattern.test(text))) {
    rank += 1.5;
  }

  if (isTechnicalNicheStory(story)) {
    rank -= 10;
  }

  if (isPromotionalStory(story)) {
    rank -= 40;
  }

  if (story.source_type === "analysis" && ageHours > 24) {
    rank -= 6;
  }

  return Math.round(rank * 10) / 10;
}

function computeDiversifiedRank(
  story: Story,
  sourceCounts: Map<string, number>,
  recentSources: string[],
  now = Date.now()
) {
  let rank = computeStoryRankScore(story, now);
  const sourceCount = sourceCounts.get(story.source) ?? 0;

  rank -= sourceCount * 7;

  if (recentSources[0] === story.source) {
    rank -= 6;
  } else if (recentSources.includes(story.source)) {
    rank -= 3;
  }

  return rank;
}

export function orderStoriesForFeed(stories: Story[], now = Date.now()) {
  const remaining = [...stories];
  const ordered: Story[] = [];
  const sourceCounts = new Map<string, number>();
  const recentSources: string[] = [];

  while (remaining.length > 0) {
    remaining.sort((left, right) => {
      const rankDiff =
        computeDiversifiedRank(right, sourceCounts, recentSources, now) -
        computeDiversifiedRank(left, sourceCounts, recentSources, now);

      if (rankDiff !== 0) {
        return rankDiff;
      }

      return Date.parse(right.published_at) - Date.parse(left.published_at);
    });

    const next = remaining.shift();

    if (!next) {
      break;
    }

    ordered.push(next);
    sourceCounts.set(next.source, (sourceCounts.get(next.source) ?? 0) + 1);
    recentSources.unshift(next.source);
    recentSources.splice(3);
  }

  return ordered;
}
