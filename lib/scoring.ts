import type { Story, StoryEnrichment, StoryTag } from "@/types/story";

export const STORY_TAGS: StoryTag[] = [
  "Platform Move",
  "Narrative Shift",
  "Product Signal",
  "Business Move",
  "Media Signal",
  "Audience Trend",
  "PR Signal"
];

export function clampScore(score: number) {
  return Math.max(1, Math.min(100, Math.round(score)));
}

export function isValidStoryTag(value: string): value is StoryTag {
  return STORY_TAGS.includes(value as StoryTag);
}

export type StoryEnrichmentValidationResult =
  | {
      success: true;
      value: StoryEnrichment;
    }
  | {
      success: false;
      error: string;
    };

const DISALLOWED_STYLE_PATTERNS = [
  /this article discusses/i,
  /this article explores/i,
  /this piece explores/i,
  /this piece highlights/i,
  /this development underscores/i,
  /today'?s rapidly evolving landscape/i,
  /game[- ]changing/i,
  /industry[- ]leading/i,
  /revolutionary/i,
  /groundbreaking/i,
  /it is worth noting/i,
  /delves into/i,
  /the article/i,
  /the piece/i,
  /the story/i
];

const GENERIC_WHY_OPENERS = [
  /^this is\b/i,
  /^this means\b/i,
  /^this shows\b/i,
  /^this highlights\b/i,
  /^this underscores\b/i,
  /^the article\b/i,
  /^the story\b/i
];

const STRATEGIC_SIGNAL_PATTERNS = [
  /\bplatform\b/i,
  /\bdistribution\b/i,
  /\baudience\b/i,
  /\bsubscription\b/i,
  /\bpricing\b/i,
  /\bmonetization\b/i,
  /\bbusiness model\b/i,
  /\bacquisition\b/i,
  /\bpartnership\b/i,
  /\bgovernance\b/i,
  /\bmarket\b/i,
  /\bcreator\b/i,
  /\bpublisher\b/i,
  /\bsearch\b/i,
  /\bworkflow\b/i,
  /\bchannel\b/i,
  /\bbundle\b/i,
  /\badoption\b/i,
  /\bconsumer\b/i,
  /\brevenue\b/i
];

const TECHNICAL_NICHE_PATTERNS = [
  /\bsdk\b/i,
  /\bapi\b/i,
  /\bbenchmark\b/i,
  /\bmodel weights?\b/i,
  /\bimplementation\b/i,
  /\bcode\b/i,
  /\bframework\b/i,
  /\bquickstart\b/i,
  /\bwalkthrough\b/i,
  /\btutorial\b/i,
  /\bhow to\b/i,
  /\bguide\b/i
];

function countSentences(value: string) {
  const matches = value.match(/[^.!?]+[.!?]+/g);

  if (!matches) {
    return value.trim() ? 1 : 0;
  }

  return matches.length;
}

function hasDisallowedStyle(value: string) {
  return DISALLOWED_STYLE_PATTERNS.some((pattern) => pattern.test(value));
}

function hasGenericWhyOpener(value: string) {
  return GENERIC_WHY_OPENERS.some((pattern) => pattern.test(value));
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeScore(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d{1,3}$/.test(value.trim())) {
    return Number(value.trim());
  }

  return null;
}

export function validateStoryEnrichmentDetailed(
  payload: unknown
): StoryEnrichmentValidationResult {
  if (!payload || typeof payload !== "object") {
    return {
      success: false,
      error: "payload is not a JSON object"
    };
  }

  const candidate = payload as Record<string, unknown>;
  const score = normalizeScore(candidate.score);

  if (
    typeof candidate.summary !== "string" ||
    typeof candidate.why_it_matters !== "string" ||
    typeof candidate.tag !== "string" ||
    score === null
  ) {
    return {
      success: false,
      error: "missing or invalid summary, why_it_matters, tag, or score"
    };
  }

  const tag = candidate.tag.trim();

  if (!isValidStoryTag(tag)) {
    return {
      success: false,
      error: "tag is not one of the allowed values"
    };
  }

  const summary = normalizeText(candidate.summary);
  const why_it_matters = normalizeText(candidate.why_it_matters);

  if (!summary || !why_it_matters) {
    return {
      success: false,
      error: "summary or why_it_matters is empty"
    };
  }

  if (hasDisallowedStyle(summary) || hasDisallowedStyle(why_it_matters)) {
    return {
      success: false,
      error: "summary or why_it_matters uses disallowed style or hype language"
    };
  }

  const summarySentenceCount = countSentences(summary);
  const whySentenceCount = countSentences(why_it_matters);

  if (summarySentenceCount < 1 || summarySentenceCount > 2) {
    return {
      success: false,
      error: "summary must be 1-2 sentences"
    };
  }

  if (whySentenceCount !== 1) {
    return {
      success: false,
      error: "why_it_matters must be exactly 1 sentence"
    };
  }

  if (why_it_matters.split(/\s+/).length > 30) {
    return {
      success: false,
      error: "why_it_matters is too long"
    };
  }

  if (hasGenericWhyOpener(why_it_matters)) {
    return {
      success: false,
      error: "why_it_matters starts with a generic opener"
    };
  }

  return {
    success: true,
    value: {
      summary,
      why_it_matters,
      tag,
      score: clampScore(score)
    }
  };
}

export function validateStoryEnrichment(payload: unknown): StoryEnrichment | null {
  const result = validateStoryEnrichmentDetailed(payload);

  return result.success ? result.value : null;
}

export function calibrateStoryScore(story: Story) {
  const combined = `${story.title} ${story.summary} ${story.why_it_matters} ${story.raw_snippet ?? ""}`;
  let score = clampScore(story.score);

  score = Math.max(60, Math.min(95, score));

  if (story.tag === "Platform Move" || story.tag === "Business Move") {
    score += 5;
  }

  if (story.tag === "Audience Trend" || story.tag === "Narrative Shift") {
    score += 4;
  }

  if (STRATEGIC_SIGNAL_PATTERNS.some((pattern) => pattern.test(combined))) {
    score += 4;
  }

  if (TECHNICAL_NICHE_PATTERNS.some((pattern) => pattern.test(combined))) {
    score -= 8;
  }

  if (story.source_type === "primary" && TECHNICAL_NICHE_PATTERNS.some((pattern) => pattern.test(combined))) {
    score -= 3;
  }

  return Math.max(60, Math.min(95, score));
}

export function diversifyStoryScores(stories: Story[]) {
  const sourceTagCounts = new Map<string, number>();

  return stories.map((story) => {
    const key = `${story.source}:${story.tag}`;
    const currentCount = sourceTagCounts.get(key) ?? 0;
    sourceTagCounts.set(key, currentCount + 1);

    let score = calibrateStoryScore(story);

    if (currentCount > 0) {
      score -= currentCount * 4;
    }

    return {
      ...story,
      score: Math.max(60, Math.min(95, score))
    };
  });
}
