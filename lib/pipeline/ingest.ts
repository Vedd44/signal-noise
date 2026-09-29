import fs from "node:fs/promises";
import path from "node:path";

import Parser from "rss-parser";

import { activeRssSources, type RssSource } from "@/lib/feeds";
import {
  evaluateStoryEditorialFit,
  getSourcePriorityBoost,
  isTechnicalNicheStory
} from "@/lib/scoring";
import {
  createStoryId,
  isValidIsoDate,
  sortByPublishedAtDesc,
  truncateText
} from "@/lib/utils";
import { normalizeExternalText } from "@/lib/pipeline/cleanText";
import { partitionStoriesByEnglishEligibility } from "@/lib/pipeline/language";
import type { NormalizedStory, StorySourceType } from "@/types/story";

type ParsedFeedItem = {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  description?: string;
  summary?: string;
  contentEncoded?: string;
  "content:encoded"?: string;
  language?: string;
  dcLanguage?: string;
};

type ParsedFeed = {
  language?: string;
};

export type IngestSourceResult = {
  source: RssSource;
  normalized: NormalizedStory[];
  pulledCount: number;
  invalidCount: number;
  filteredCount: number;
  nonEnglishRejectedCount: number;
  nonEnglishRejectedTitles: string[];
  sourceGuardRejectedTitles: string[];
  error: string | null;
};

export type IngestionPipelineResult = {
  stories: NormalizedStory[];
  sourceResults: IngestSourceResult[];
};

const parser = new Parser<ParsedFeed, ParsedFeedItem>({
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["description", "description"],
      ["language", "language"],
      ["dc:language", "dcLanguage"]
    ]
  }
});
const NORMALIZED_OUTPUT_PATH = path.join(
  process.cwd(),
  "data",
  "normalized-stories.json"
);
const MAX_STORIES = 50;
const REQUEST_TIMEOUT_MS = 12000;
const MIN_TITLE_LENGTH = 24;
const MIN_SNIPPET_LENGTH = 80;
const MAX_SNIPPET_LENGTH = 900;
const LOW_SIGNAL_PATTERNS = [
  /\bchangelog\b/i,
  /\brelease notes\b/i,
  /\bpatch notes\b/i,
  /release:/i,
  /tool:/i,
  /\bbug fixes?\b/i,
  /\bversion\s+\d+(\.\d+)+\b/i,
  /\bv?\d+(\.\d+){1,3}\b/,
  /\bplugin\b/i,
  /\bsdk\b/i,
  /\bcli\b/i,
  /\blibrary\b/i,
  /\bapi client\b/i,
  /tags:/i,
  /\bdeals?\b/i,
  /\bon sale\b/i,
  /\bpreorder\b/i,
  /\breview\b/i,
  /\bhands[- ]on\b/i,
  /\bthe best\b/i,
  /\bbest .* right now\b/i
];
const HARD_REJECT_PATTERNS = [/\bdeals?\b/i, /\bon sale\b/i, /\bpreorder\b/i, /\bbest .* right now\b/i];
const ALLOWLIST_PATTERNS = [
  /\bai\b/i,
  /\bagent(ic)?\b/i,
  /\bmedia\b/i,
  /\bstrategy\b/i,
  /\bplatform\b/i,
  /\baudience\b/i,
  /\bbusiness\b/i,
  /\bmodel\b/i,
  /\bsearch\b/i,
  /\bvideo\b/i,
  /\blaunch\b/i,
  /\bunveil\b/i,
  /\bannounce\b/i,
  /\bdevice\b/i,
  /\bhardware\b/i,
  /\bphone\b/i,
  /\bheadset\b/i,
  /\bwearable\b/i,
  /\btv\b/i,
  /\blaptop\b/i,
  /\bearbuds?\b/i
];

const GUARDED_SOURCES = new Set(["404 Media", "The Register", "The New Stack"]);
const GUARDED_SOURCE_RELEVANCE_GROUPS = [
  /\b(ai|artificial intelligence|llm|large language model|agents?|agentic|chatgpt|claude|gemini|model training)\b/i,
  /\b(platform|social media|social network|app store|marketplace|browsers?|cloud|streaming|publisher|advertising technology)\b/i,
  /\b(security|privacy|surveil(?:lance|led|ling)?|data broker|breach|ransomware|cyberattack|vulnerability|malware|phishing|hackers?|(?:cops?|police|law enforcement).{0,30}(?:cameras?|flock|axon))\b/i,
  /\b(semiconductor|chips?|gpu|processors?|hardware|data center|smartphone|wearable|robotics?|self-driving|autonomous vehicles?)\b/i,
  /\b(startups?|funding|acquisition|partnership|antitrust|regulation|technology policy|supply chain|layoffs?|pricing|revenue|profit|subscription|licensing)\b/i,
  /\b(enterprise technology|enterprise software|open source|developer platform|software platform|infrastructure strategy)\b/i
];
const GUARDED_SOURCE_ROUTINE_CONTENT = [
  /^how to\b/i,
  /\b(tutorial|walkthrough|quickstart|troubleshoot(?:ing)?)\b/i,
  /\b(outdated|legacy)\b.{0,40}\b(servers?|systems?|software)\b/i,
  /\b(service|system)\b.{0,35}\b(stuck|outage|offline|down)\b|\b(stuck|outage|offline|down)\b.{0,35}\b(service|system|outbox)\b/i
];
const GUARDED_SOURCE_BROAD_IMPACT =
  /\b(market|strategy|acquisition|funding|breach|ransomware|surveillance|data broker|regulation|antitrust|supply chain|layoffs?)\b/i;

export function passesSourceSpecificRelevanceGuard(story: NormalizedStory) {
  if (!GUARDED_SOURCES.has(story.source)) {
    return true;
  }

  const title = story.title.trim();
  const combined = `${title} ${story.raw_snippet}`.trim();
  const routineContent = GUARDED_SOURCE_ROUTINE_CONTENT.some((pattern) => pattern.test(title));

  if (routineContent && !GUARDED_SOURCE_BROAD_IMPACT.test(combined)) {
    return false;
  }

  const titleHasStrongSignal = GUARDED_SOURCE_RELEVANCE_GROUPS.some((pattern) =>
    pattern.test(title)
  );

  if (titleHasStrongSignal) {
    return true;
  }

  const matchingGroups = GUARDED_SOURCE_RELEVANCE_GROUPS.filter((pattern) =>
    pattern.test(story.raw_snippet)
  ).length;

  return matchingGroups >= 2;
}

function computeCandidatePriority(story: NormalizedStory) {
  const ageHours = Math.max(
    0,
    (Date.now() - Date.parse(story.published_at)) / (1000 * 60 * 60)
  );

  return getSourcePriorityBoost(story.source) * 10 - ageHours;
}

async function fetchFeedXml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "signal-noise-ingest/0.1"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSnippet(item: ParsedFeedItem) {
  const candidates = [
    item.contentEncoded,
    item["content:encoded"],
    item.content,
    item.description,
    item.summary,
    item.contentSnippet
  ]
    .map((value) => normalizeExternalText(value ?? "", { stripHtml: true }))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  return truncateText(candidates[0] ?? "", MAX_SNIPPET_LENGTH);
}

function normalizePublishedAt(item: ParsedFeedItem) {
  const publishedAt = item.isoDate ?? item.pubDate ?? "";

  if (!publishedAt || !isValidIsoDate(publishedAt)) {
    return null;
  }

  return new Date(publishedAt).toISOString();
}

function normalizeItem(
  source: RssSource,
  item: ParsedFeedItem,
  feedLanguage?: string
): NormalizedStory | null {
  const title = normalizeExternalText(item.title ?? "", { stripHtml: true });
  const url = item.link?.trim() ?? "";
  const published_at = normalizePublishedAt(item);

  if (!title || !url || !published_at) {
    return null;
  }

  return {
    id: createStoryId(source.name, title, url),
    title,
    url,
    source: source.name,
    source_type: source.source_type,
    published_at,
    raw_snippet: normalizeSnippet(item),
    feed_language: feedLanguage,
    item_language: item.language ?? item.dcLanguage,
    created_at: new Date().toISOString()
  };
}

function looksLowSignal(story: NormalizedStory) {
  const combined = `${story.title} ${story.raw_snippet}`.trim();
  const editorialFit = evaluateStoryEditorialFit(story);

  if (HARD_REJECT_PATTERNS.some((pattern) => pattern.test(combined)) || !editorialFit.keep) {
    return true;
  }

  if (story.title.length < MIN_TITLE_LENGTH) {
    return true;
  }

  if (story.raw_snippet.length > 0 && story.raw_snippet.length < MIN_SNIPPET_LENGTH) {
    const hasAllowlistSignal =
      ALLOWLIST_PATTERNS.some((pattern) => pattern.test(combined)) ||
      editorialFit.prioritySource;

    if (!hasAllowlistSignal) {
      return true;
    }
  }

  const matchesLowSignalPattern = LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(combined));
  const hasAllowlistSignal =
    ALLOWLIST_PATTERNS.some((pattern) => pattern.test(combined)) ||
    editorialFit.prioritySource;

  if (matchesLowSignalPattern && !hasAllowlistSignal) {
    return true;
  }

  if (isTechnicalNicheStory(story) && !editorialFit.prioritySource) {
    return true;
  }

  return false;
}

function balanceStoriesBySourceType(stories: NormalizedStory[]) {
  const buckets = new Map<StorySourceType, NormalizedStory[]>(
    ["primary", "reporting", "analysis"].map((type) => [type as StorySourceType, []])
  );

  for (const story of stories) {
    buckets.get(story.source_type)?.push(story);
  }

  for (const [, bucket] of buckets) {
    bucket.sort((left, right) => {
      const priorityDiff = computeCandidatePriority(right) - computeCandidatePriority(left);

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return Date.parse(right.published_at) - Date.parse(left.published_at);
    });
  }

  const orderedTypes: StorySourceType[] = ["reporting", "primary", "analysis"];
  const balanced: NormalizedStory[] = [];

  while (balanced.length < MAX_STORIES) {
    let addedInRound = false;

    for (const type of orderedTypes) {
      const nextStory = buckets.get(type)?.shift();

      if (!nextStory) {
        continue;
      }

      balanced.push(nextStory);
      addedInRound = true;

      if (balanced.length >= MAX_STORIES) {
        break;
      }
    }

    if (!addedInRound) {
      break;
    }
  }

  return balanced;
}

async function ingestSource(source: RssSource): Promise<IngestSourceResult> {
  try {
    const xml = await fetchFeedXml(source.rss_url);
    const parsed = await parser.parseString(xml);
    const parsedItems = parsed.items ?? [];
    const normalizedCandidates = parsedItems.map((item) =>
      normalizeItem(source, item, parsed.language)
    );
    const validStories = normalizedCandidates.filter(
      (item): item is NormalizedStory => item !== null
    );
    const languageEligibility = partitionStoriesByEnglishEligibility(validStories);
    const globallyFilteredStories = languageEligibility.eligibleStories.filter(
      (story) => !looksLowSignal(story)
    );
    const sourceGuardRejected = globallyFilteredStories.filter(
      (story) => !passesSourceSpecificRelevanceGuard(story)
    );
    const filteredStories = globallyFilteredStories.filter(passesSourceSpecificRelevanceGuard);
    const normalized = sortByPublishedAtDesc(filteredStories).slice(
      0,
      source.max_items_per_source
    );

    return {
      source,
      normalized,
      pulledCount: parsedItems.length,
      invalidCount: parsedItems.length - validStories.length,
      filteredCount: validStories.length - filteredStories.length,
      nonEnglishRejectedCount: languageEligibility.rejectedStories.length,
      nonEnglishRejectedTitles: languageEligibility.rejectedStories.map((story) => story.title),
      sourceGuardRejectedTitles: sourceGuardRejected.map((story) => story.title),
      error: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return {
      source,
      normalized: [],
      pulledCount: 0,
      invalidCount: 0,
      filteredCount: 0,
      nonEnglishRejectedCount: 0,
      nonEnglishRejectedTitles: [],
      sourceGuardRejectedTitles: [],
      error: message
    };
  }
}

export async function runIngestionPipeline(): Promise<IngestionPipelineResult> {
  const sourceResults = await Promise.all(
    activeRssSources.map((source) => ingestSource(source))
  );
  const stories = balanceStoriesBySourceType(
    sourceResults.flatMap((result) => result.normalized)
  );

  return {
    stories,
    sourceResults
  };
}

export async function writeNormalizedStories(stories: NormalizedStory[]) {
  await fs.mkdir(path.dirname(NORMALIZED_OUTPUT_PATH), { recursive: true });
  await fs.writeFile(NORMALIZED_OUTPUT_PATH, JSON.stringify(stories, null, 2));
}

export function printIngestionSummary(
  stories: NormalizedStory[],
  sourceResults: IngestSourceResult[],
  options?: { includeStoryDetails?: boolean }
) {
  sourceResults.forEach(({ source, normalized, pulledCount, invalidCount, filteredCount, nonEnglishRejectedCount, error }) => {
    if (error) {
      console.warn(`- ${source.name}: skipped (${error})`);
      return;
    }

    console.log(
      `- ${source.name}: pulled ${pulledCount}, invalid ${invalidCount}, filtered ${filteredCount}, non-English ${nonEnglishRejectedCount}, kept ${normalized.length}`
    );
  });

  console.log(`\nNormalized ${stories.length} stories.`);

  if (options?.includeStoryDetails === false) {
    return;
  }

  console.log("");

  stories.slice(0, 20).forEach((story, index) => {
    console.log(`${index + 1}. ${story.title}`);
    console.log(`   ${story.source} · ${story.source_type} · ${story.published_at}`);
    console.log(`   ${story.url}`);

    if (story.raw_snippet) {
      console.log(`   ${story.raw_snippet}`);
    }

    console.log("");
  });
}

export const normalizedStoriesOutputPath = NORMALIZED_OUTPUT_PATH;
