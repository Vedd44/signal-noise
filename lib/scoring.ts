import type { Story, StoryEnrichment, StoryTag } from "@/types/story";

export const STORY_TAGS: StoryTag[] = [
  "AI",
  "Product",
  "Media",
  "Strategy",
  "Business",
  "Consumer Tech"
];

const LEGACY_STORY_TAG_MAP = {
  "Platform Move": "Strategy",
  "Narrative Shift": "Strategy",
  "Product Signal": "Product",
  "Business Move": "Business",
  "Media Signal": "Media",
  "Audience Trend": "Strategy",
  "PR Signal": "Strategy"
} as const satisfies Record<string, StoryTag>;

const TAG_SCORE_BOOSTS: Record<StoryTag, number> = {
  AI: 5,
  Product: 3,
  Media: 3,
  Strategy: 4,
  Business: 4,
  "Consumer Tech": 3
};

const SOURCE_PRIORITY_BOOSTS: Record<string, number> = {
  OpenAI: 8,
  "Google AI Blog": 7,
  "Meta Newsroom": 5,
  "Apple Newsroom": 5,
  TechCrunch: 6,
  "The Verge": 6,
  Platformer: 4,
  Engadget: 4,
  "Digital Trends": 4,
  WIRED: 2,
  "Ars Technica": 2,
  Stratechery: 2,
  Netflix: 4,
  Spotify: 4
};

export const AI_PATTERNS = [
  /\bai\b/i,
  /\bmodel\b/i,
  /\bllm\b/i,
  /\bagent(ic)?\b/i,
  /\bchatgpt\b/i,
  /\bgemini\b/i,
  /\bclaude\b/i,
  /\bassistant\b/i,
  /\bsearch\b/i
];

export const MEDIA_PATTERNS = [
  /\bmedia\b/i,
  /\bpublisher\b/i,
  /\bpublishing\b/i,
  /\bnewsroom\b/i,
  /\bcreator\b/i,
  /\bstreaming\b/i,
  /\badvertising\b/i,
  /\baudience\b/i,
  /\bpodcast\b/i,
  /\bvideo\b/i
];

export const STRATEGY_PATTERNS = [
  /\bstrategy\b/i,
  /\bplatform\b/i,
  /\becosystem\b/i,
  /\bdistribution\b/i,
  /\bpartnership\b/i,
  /\bacquisition\b/i,
  /\bmarket\b/i,
  /\bcompetition\b/i,
  /\bdefault\b/i,
  /\bgovernance\b/i,
  /\bchannel\b/i
];

export const BUSINESS_PATTERNS = [
  /\bpricing\b/i,
  /\brevenue\b/i,
  /\bsubscription\b/i,
  /\bmonetization\b/i,
  /\bfunding\b/i,
  /\bearnings\b/i,
  /\bbusiness model\b/i,
  /\bprofit\b/i,
  /\badvertising\b/i,
  /\bmerger\b/i,
  /\bacquisition\b/i
];

export const PRODUCT_PATTERNS = [
  /\blaunch\b/i,
  /\bdebut\b/i,
  /\bannounce\b/i,
  /\bunveil\b/i,
  /\broll out\b/i,
  /\bintroduc(e|es|ing)\b/i,
  /\bfeature\b/i,
  /\bproduct\b/i,
  /\bupdate\b/i,
  /\bapp\b/i,
  /\bservice\b/i
];

export const CONSUMER_TECH_PATTERNS = [
  /\bphone\b/i,
  /\bsmartphone\b/i,
  /\btablet\b/i,
  /\bwatch\b/i,
  /\bwearable\b/i,
  /\bheadset\b/i,
  /\bearbuds?\b/i,
  /\blaptop\b/i,
  /\bpc\b/i,
  /\btv\b/i,
  /\btelevision\b/i,
  /\bconsole\b/i,
  /\bcamera\b/i,
  /\bdevice\b/i,
  /\bhardware\b/i,
  /\biphone\b/i,
  /\bipad\b/i,
  /\bmac\b/i
];

const PROMOTIONAL_PATTERNS = [
  /\bpromo code\b/i,
  /\b\d{1,3}%\s+off\b/i,
  /\b% off\b/i,
  /\bdeals?\b/i,
  /\bcoupon(s)?\b/i,
  /\bon sale\b/i,
  /\bclearance\b/i,
  /\bdiscount\b/i,
  /\bsave \$\d+/i
];

export function clampScore(score: number) {
  return Math.max(1, Math.min(100, Math.round(score)));
}

export function isValidStoryTag(value: string): value is StoryTag {
  return STORY_TAGS.includes(value as StoryTag);
}

export function normalizeStoryTag(value: string): StoryTag | null {
  const normalized = value.trim();

  if (isValidStoryTag(normalized)) {
    return normalized;
  }

  return LEGACY_STORY_TAG_MAP[normalized as keyof typeof LEGACY_STORY_TAG_MAP] ?? null;
}

export function getSourcePriorityBoost(source: string) {
  return SOURCE_PRIORITY_BOOSTS[source] ?? 0;
}

type StoryLike = {
  title: string;
  source: string;
  source_type?: string;
  raw_snippet?: string;
  summary?: string;
  why_it_matters?: string;
  tag?: string;
  score?: number;
};

export function getStoryEditorialText(story: StoryLike) {
  return [
    story.title,
    story.summary ?? "",
    story.why_it_matters ?? "",
    story.raw_snippet ?? ""
  ]
    .join(" ")
    .trim();
}

export function isPromotionalStory(story: StoryLike) {
  return PROMOTIONAL_PATTERNS.some((pattern) => pattern.test(getStoryEditorialText(story)));
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
  /this marks a broader shift/i,
  /this demonstrates/i,
  /the move signals/i,
  /in an evolving landscape/i,
  /as ai continues to/i,
  /addressable market/i,
  /data loop/i,
  /strategic inflection point/i,
  /businesses and consumers/i,
  /today'?s rapidly evolving landscape/i,
  /game[- ]changing/i,
  /industry[- ]leading/i,
  /revolutionary/i,
  /groundbreaking/i,
  /it is worth noting/i,
  /delves into/i,
  /the article/i,
  /the piece/i,
  /the story/i,
  /\bless about\b/i,
  /\bmore about\b/i,
  /\buseful mainly as\b/i
];

const GENERIC_WHY_OPENERS = [
  /^this is\b/i,
  /^this means\b/i,
  /^this signals\b/i,
  /^this shows\b/i,
  /^this highlights\b/i,
  /^this underscores\b/i,
  /^this reflects\b/i,
  /^this suggests\b/i,
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
  /\brevenue\b/i,
  /\blaunch\b/i,
  /\bdevice\b/i,
  /\bhardware\b/i,
  /\bwearable\b/i,
  /\bphone\b/i
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

const AWS_DEV_HEAVY_PATTERNS = [
  /\baws\b/i,
  /\bamazon web services\b/i,
  /\bdeveloper blog\b/i,
  /\bengineering blog\b/i,
  /\bcloudformation\b/i,
  /\bkubernetes\b/i,
  /\bterraform\b/i,
  /\bcontainer(s)?\b/i
];

export function countSentences(value: string) {
  const protectedText = value
    .trim()
    .replace(/https?:\/\/\S+/gi, (match) => {
      const ending = match.match(/([.!?])(["'’”\])}]*)$/);
      return ending ? `URL${ending[1]}${ending[2]}` : "URL";
    })
    .replace(/\b(?:e\.g|i\.e|a\.m|p\.m)\./gi, (match) => match.replaceAll(".", ""))
    .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|Inc|Ltd|Co)\./g, (match) =>
      match.slice(0, -1)
    )
    .replace(/\b(?:[A-Z]\.){2,}/g, (match) => match.replaceAll(".", ""))
    .replace(/\b[A-Z]\.(?=\s+[A-Z][a-z])/g, (match) => match.slice(0, -1))
    .replace(/\b\d+\.\d+(?:\.\d+)*\b/g, (match) => match.replaceAll(".", "·"));
  const matches = protectedText.match(/[.!?]+(?:["'’”\])}]+)?(?=\s+[A-Z0-9]|\s*$)/g);

  if (!matches) {
    return protectedText ? 1 : 0;
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

export function isTechnicalNicheStory(story: StoryLike) {
  const combined = getStoryEditorialText(story);

  return (
    TECHNICAL_NICHE_PATTERNS.some((pattern) => pattern.test(combined)) ||
    AWS_DEV_HEAVY_PATTERNS.some((pattern) => pattern.test(combined))
  );
}

export function evaluateStoryEditorialFit(story: StoryLike) {
  const combined = getStoryEditorialText(story);
  const normalizedTag = story.tag ? normalizeStoryTag(story.tag) : null;
  const hasAiSignal = AI_PATTERNS.some((pattern) => pattern.test(combined));
  const hasMediaSignal = MEDIA_PATTERNS.some((pattern) => pattern.test(combined));
  const hasStrategySignal = STRATEGY_PATTERNS.some((pattern) => pattern.test(combined));
  const hasBusinessSignal = BUSINESS_PATTERNS.some((pattern) => pattern.test(combined));
  const hasProductSignal = PRODUCT_PATTERNS.some((pattern) => pattern.test(combined));
  const hasConsumerTechSignal = CONSUMER_TECH_PATTERNS.some((pattern) => pattern.test(combined));
  const hasFocusSignal =
    hasAiSignal ||
    hasMediaSignal ||
    hasStrategySignal ||
    hasBusinessSignal ||
    hasProductSignal ||
    hasConsumerTechSignal ||
    normalizedTag !== null;
  const promotional = isPromotionalStory(story);
  const technicalNiche = isTechnicalNicheStory(story);
  const prioritySource = getSourcePriorityBoost(story.source) >= 5;
  const broadBusinessOrConsumerSignal =
    hasAiSignal ||
    hasMediaSignal ||
    hasStrategySignal ||
    hasBusinessSignal ||
    hasProductSignal ||
    hasConsumerTechSignal;

  if (promotional) {
    return {
      keep: false,
      reason: "promotional content",
      hasFocusSignal,
      technicalNiche,
      prioritySource
    };
  }

  if (!hasFocusSignal) {
    return {
      keep: false,
      reason: "outside editorial focus",
      hasFocusSignal,
      technicalNiche,
      prioritySource
    };
  }

  if (technicalNiche && !broadBusinessOrConsumerSignal && !prioritySource) {
    return {
      keep: false,
      reason: "overly technical or niche",
      hasFocusSignal,
      technicalNiche,
      prioritySource
    };
  }

  if (typeof story.score === "number" && story.score < 68 && technicalNiche) {
    return {
      keep: false,
      reason: "low-scoring technical noise",
      hasFocusSignal,
      technicalNiche,
      prioritySource
    };
  }

  return {
    keep: true,
    reason: null,
    hasFocusSignal,
    technicalNiche,
    prioritySource
  };
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

  if (score < 1 || score > 100 || !Number.isInteger(score)) {
    return {
      success: false,
      error: "score must be an integer from 1 to 100"
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

  if (summarySentenceCount !== 1) {
    return {
      success: false,
      error: "summary must be exactly 1 sentence"
    };
  }

  if (whySentenceCount !== 1) {
    return {
      success: false,
      error: "why_it_matters must be exactly 1 sentence"
    };
  }

  if (summary.split(/\s+/).length > 35) {
    return {
      success: false,
      error: "summary is too long for a context line"
    };
  }

  if (why_it_matters.split(/\s+/).length > 32) {
    return {
      success: false,
      error: "why_it_matters is too long"
    };
  }

  if (hasGenericWhyOpener(why_it_matters)) {
    return {
      success: false,
      error: "why_it_matters starts with a generic or repetitive opener"
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
  const combined = getStoryEditorialText(story);
  const fit = evaluateStoryEditorialFit(story);
  const normalizedTag = normalizeStoryTag(story.tag) ?? "Strategy";
  let score = clampScore(story.score);

  score = Math.max(60, Math.min(95, score));

  score += TAG_SCORE_BOOSTS[normalizedTag];
  score += getSourcePriorityBoost(story.source);

  if (STRATEGIC_SIGNAL_PATTERNS.some((pattern) => pattern.test(combined))) {
    score += 4;
  }

  if (!fit.hasFocusSignal) {
    score -= 12;
  }

  if (fit.technicalNiche) {
    score -= 10;
  }

  if (story.source_type === "primary" && fit.technicalNiche) {
    score -= 4;
  }

  if (isPromotionalStory(story)) {
    score -= 25;
  }

  return Math.max(60, Math.min(95, score));
}

export function diversifyStoryScores(stories: Story[]) {
  const sourceCounts = new Map<string, number>();

  return stories.map((story) => {
    const currentCount = sourceCounts.get(story.source) ?? 0;
    sourceCounts.set(story.source, currentCount + 1);

    let score = calibrateStoryScore(story);

    if (currentCount > 0) {
      score -= currentCount * 5;
    }

    return {
      ...story,
      score: Math.max(60, Math.min(95, score))
    };
  });
}
