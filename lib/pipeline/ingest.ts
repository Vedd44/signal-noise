import fs from "node:fs/promises";
import path from "node:path";

import Parser from "rss-parser";

import { rssSources } from "@/lib/feeds";
import {
  createStoryId,
  isValidIsoDate,
  sortByPublishedAtDesc,
  stripHtml,
  truncateText
} from "@/lib/utils";
import type { NormalizedStory, StorySourceType } from "@/types/story";

type ParsedFeedItem = {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
};

export type IngestSourceResult = {
  source: (typeof rssSources)[number];
  normalized: NormalizedStory[];
  pulledCount: number;
  invalidCount: number;
  filteredCount: number;
  error: string | null;
};

export type IngestionPipelineResult = {
  stories: NormalizedStory[];
  sourceResults: IngestSourceResult[];
};

const parser = new Parser<Record<string, never>, ParsedFeedItem>();
const NORMALIZED_OUTPUT_PATH = path.join(
  process.cwd(),
  "data",
  "normalized-stories.json"
);
const MAX_STORIES = 50;
const MAX_ITEMS_PER_SOURCE = 6;
const REQUEST_TIMEOUT_MS = 12000;
const MIN_TITLE_LENGTH = 24;
const MIN_SNIPPET_LENGTH = 80;
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
  /tags:/i
];
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
  /\bvideo\b/i
];

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
  const candidates = [item.content, item.summary, item.contentSnippet]
    .map((value) => stripHtml(value ?? ""))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  return truncateText(candidates[0] ?? "", 420);
}

function normalizePublishedAt(item: ParsedFeedItem) {
  const publishedAt = item.isoDate ?? item.pubDate ?? "";

  if (!publishedAt || !isValidIsoDate(publishedAt)) {
    return null;
  }

  return new Date(publishedAt).toISOString();
}

function normalizeItem(
  source: (typeof rssSources)[number],
  item: ParsedFeedItem
): NormalizedStory | null {
  const title = item.title?.trim() ?? "";
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
    created_at: new Date().toISOString()
  };
}

function looksLowSignal(story: NormalizedStory) {
  const combined = `${story.title} ${story.raw_snippet}`.trim();

  if (story.title.length < MIN_TITLE_LENGTH) {
    return true;
  }

  if (story.raw_snippet.length > 0 && story.raw_snippet.length < MIN_SNIPPET_LENGTH) {
    const hasAllowlistSignal = ALLOWLIST_PATTERNS.some((pattern) => pattern.test(combined));

    if (!hasAllowlistSignal) {
      return true;
    }
  }

  const matchesLowSignalPattern = LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(combined));
  const hasAllowlistSignal = ALLOWLIST_PATTERNS.some((pattern) => pattern.test(combined));

  if (matchesLowSignalPattern && !hasAllowlistSignal) {
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
    bucket.sort((left, right) => Date.parse(right.published_at) - Date.parse(left.published_at));
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

async function ingestSource(source: (typeof rssSources)[number]): Promise<IngestSourceResult> {
  try {
    const xml = await fetchFeedXml(source.rss_url);
    const parsed = await parser.parseString(xml);
    const parsedItems = parsed.items ?? [];
    const normalizedCandidates = parsedItems.map((item) => normalizeItem(source, item));
    const validStories = normalizedCandidates.filter(
      (item): item is NormalizedStory => item !== null
    );
    const filteredStories = validStories.filter((story) => !looksLowSignal(story));
    const normalized = sortByPublishedAtDesc(filteredStories).slice(0, MAX_ITEMS_PER_SOURCE);

    return {
      source,
      normalized,
      pulledCount: parsedItems.length,
      invalidCount: parsedItems.length - validStories.length,
      filteredCount: validStories.length - filteredStories.length,
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
      error: message
    };
  }
}

export async function runIngestionPipeline(): Promise<IngestionPipelineResult> {
  const sourceResults = await Promise.all(rssSources.map((source) => ingestSource(source)));
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
  sourceResults: IngestSourceResult[]
) {
  sourceResults.forEach(({ source, normalized, pulledCount, invalidCount, filteredCount, error }) => {
    if (error) {
      console.warn(`- ${source.name}: skipped (${error})`);
      return;
    }

    console.log(
      `- ${source.name}: pulled ${pulledCount}, invalid ${invalidCount}, filtered ${filteredCount}, kept ${normalized.length}`
    );
  });

  console.log(`\nNormalized ${stories.length} stories:\n`);

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
