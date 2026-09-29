import {
  getAccessibilityPreference,
  isPremierEligibleSource
} from "@/lib/feeds";
import { getStoryTopics } from "@/lib/utils";
import type { PublicStoryTopic, Story } from "@/types/story";

const LEAD_COMPARABLE_SCORE_GAP = 2;
const WORTH_COMPARABLE_SCORE_GAP = 1;
const ACCESSIBILITY_WINDOW = 3;

function selectLeadStory(stories: Story[]) {
  const eligible = stories.filter((story) => isPremierEligibleSource(story.source));
  const topEligible = eligible[0];

  if (!topEligible) return undefined;

  return (
    eligible.slice(0, ACCESSIBILITY_WINDOW).find((story) => {
      return (
        story.score >= topEligible.score - LEAD_COMPARABLE_SCORE_GAP &&
        getAccessibilityPreference(story.source) >
          getAccessibilityPreference(topEligible.source)
      );
    }) ?? topEligible
  );
}

function selectWorthKnowingStories(stories: Story[]) {
  const remaining = stories.filter((story) => isPremierEligibleSource(story.source));
  const selected: Story[] = [];

  while (selected.length < 3 && remaining.length > 0) {
    const topCandidate = remaining[0];
    const comparable = remaining.slice(0, ACCESSIBILITY_WINDOW).filter((story) => {
      return story.score >= topCandidate.score - WORTH_COMPARABLE_SCORE_GAP;
    });
    const preferred = comparable.reduce((best, story) => {
      return getAccessibilityPreference(story.source) >
        getAccessibilityPreference(best.source)
        ? story
        : best;
    }, topCandidate);

    selected.push(preferred);
    remaining.splice(
      remaining.findIndex((story) => story.id === preferred.id),
      1
    );
  }

  return selected;
}

export function organizeBriefingStories(stories: Story[], topic: PublicStoryTopic) {
  const leadStory = selectLeadStory(stories);
  const storiesBelowLead = stories.filter((story) => story.id !== leadStory?.id);
  const filteredBriefingStories =
    topic === "All"
      ? storiesBelowLead
      : storiesBelowLead.filter((story) => getStoryTopics(story).includes(topic));
  const worthKnowingStories = selectWorthKnowingStories(filteredBriefingStories);
  const worthKnowingIds = new Set(worthKnowingStories.map((story) => story.id));
  const latestStories = filteredBriefingStories
    .filter((story) => !worthKnowingIds.has(story.id))
    .sort((left, right) => {
      return Date.parse(right.published_at) - Date.parse(left.published_at);
    });

  return {
    leadStory,
    filteredBriefingStories,
    worthKnowingStories,
    latestStories
  };
}
