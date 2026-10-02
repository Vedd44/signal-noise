import { mapConcurrent } from "@/lib/pipeline/concurrency";
import fs from "node:fs/promises";
import path from "node:path";

import { getSupabaseServiceClient } from "@/lib/db";
import { normalizeExternalText } from "@/lib/pipeline/cleanText";
import { partitionStoriesByEnglishEligibility } from "@/lib/pipeline/language";
import { getOpenAIClient } from "@/lib/openai";
import {
  buildStoryEnrichmentPrompt,
  STRATEGIST_BRIEFING_SYSTEM_PROMPT
} from "@/lib/prompts";
import {
  STORY_TAGS,
  diversifyStoryScores,
  validateStoryEnrichmentDetailed
} from "@/lib/scoring";
import { computeStoryRankScore } from "@/lib/utils";
import type { NormalizedStory, Story, StoryEnrichment } from "@/types/story";

const ENRICHED_OUTPUT_PATH = path.join(
  process.cwd(),
  "data",
  "enriched-stories.json"
);
const NORMALIZED_INPUT_PATH = path.join(
  process.cwd(),
  "data",
  "normalized-stories.json"
);
const DEFAULT_BATCH_SIZE = 12;
const DEFAULT_MODEL = "gpt-6-luna";
const MAX_OUTPUT_TOKENS = 300;
const MAX_ENRICHMENT_ATTEMPTS = 2;

const enrichmentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "why_it_matters", "tag", "score"],
  properties: {
    summary: {
      type: "string",
      description: "A one-sentence factual context line explaining what happened."
    },
    why_it_matters: {
      type: "string",
      description:
        "A short editorial takeaway stating what changes and why it matters."
    },
    tag: {
      type: "string",
      enum: STORY_TAGS
    },
    score: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      description: "Signal strength from 1 to 100."
    }
  }
} as const;

export type EnrichmentRunResult = {
  enrichedStories: Story[];
  skippedStories: Array<{ title: string; reason: string }>;
  submittedCount: number;
  nonEnglishRejectedCount: number;
  aiUsage: AiUsageSummary;
};

export type AiUsageSummary = {
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalLatencyMs: number;
  retryCount: number;
};

export type ExistingStoryFilterResult = {
  storiesToEnrich: NormalizedStory[];
  alreadyExistingCount: number;
};

export type UpsertStoriesResult = {
  insertedCount: number;
  updatedCount: number;
  nonEnglishRejectedCount: number;
};

export type CleanupStoriesResult = {
  deletedCount: number;
  cutoffTimestamp: string;
};

export type SourceInventoryCleanupResult = {
  deletedCount: number;
  affectedSources: number;
};

export const RETENTION_HOURS = 72;
export const MAX_PUBLISHED_STORIES_PER_SOURCE = 6;

type ExistingStoryRow = Pick<
  Story,
  "id" | "url" | "title" | "source" | "source_type" | "published_at" | "created_at"
> & {
  raw_snippet: string | null;
};

export function getOpenAIModel(model?: string) {
  return model?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

function getReasoningConfig(model: string) {
  return model === "gpt-6-luna" || model === "gpt-5.6" || model.startsWith("gpt-5.6-")
    ? {
        reasoning: {
          effort: "none" as const
        }
      }
    : {};
}

function createAiUsageSummary(model: string): AiUsageSummary {
  return {
    model,
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalLatencyMs: 0,
    retryCount: 0
  };
}

function addAiUsage(target: AiUsageSummary, usage: AiUsageSummary) {
  target.requestCount += usage.requestCount;
  target.inputTokens += usage.inputTokens;
  target.outputTokens += usage.outputTokens;
  target.totalLatencyMs += usage.totalLatencyMs;
  target.retryCount += usage.retryCount;
}

function buildRetryGuidance(failureReason: string) {
  const normalized = failureReason.toLowerCase();
  let correction = "Return a complete result that satisfies the failed validation rule.";

  if (normalized.includes("summary must be exactly")) {
    correction = "Rewrite summary as one complete sentence.";
  } else if (normalized.includes("why_it_matters must be exactly")) {
    correction = "Rewrite why_it_matters as one complete sentence.";
  } else if (normalized.includes("too long")) {
    correction = "Shorten the flagged field while preserving its specific meaning.";
  } else if (normalized.includes("generic") || normalized.includes("style")) {
    correction = "Replace generic or formulaic language with a concrete, story-specific statement.";
  } else if (normalized.includes("tag")) {
    correction = "Choose exactly one allowed tag that best fits the supplied evidence.";
  } else if (normalized.includes("score")) {
    correction = "Return score as an integer from 1 to 100.";
  } else if (normalized.includes("empty") || normalized.includes("missing")) {
    correction = "Supply every required field with a non-empty value of the required type.";
  }

  return `Previous validation failure: ${failureReason}. ${correction} Keep every factual statement limited to the supplied source material; do not add plausible context or prior knowledge.`;
}

function normalizeCandidate(story: NormalizedStory): NormalizedStory {
  return {
    ...story,
    title: normalizeExternalText(story.title, { stripHtml: true }),
    source: normalizeExternalText(story.source, { stripHtml: true }),
    raw_snippet: normalizeExternalText(story.raw_snippet, { stripHtml: true })
  };
}

function storyContentIsUnchanged(story: NormalizedStory, existing: ExistingStoryRow) {
  return (
    story.title === normalizeExternalText(existing.title, { stripHtml: true }) &&
    story.source === normalizeExternalText(existing.source, { stripHtml: true }) &&
    story.source_type === existing.source_type &&
    Date.parse(story.published_at) === Date.parse(existing.published_at) &&
    story.raw_snippet ===
      normalizeExternalText(existing.raw_snippet ?? "", { stripHtml: true })
  );
}

export async function filterExistingStories(
  stories: NormalizedStory[]
): Promise<ExistingStoryFilterResult> {
  if (stories.length === 0) {
    return {
      storiesToEnrich: [],
      alreadyExistingCount: 0
    };
  }

  const candidates = stories.map(normalizeCandidate);
  const supabase = getSupabaseServiceClient();
  const selectFields =
    "id, url, title, source, source_type, published_at, raw_snippet, created_at";
  const [urlResult, idResult] = await Promise.all([
    supabase.from("stories").select(selectFields).in(
      "url",
      candidates.map((story) => story.url)
    ),
    supabase.from("stories").select(selectFields).in(
      "id",
      candidates.map((story) => story.id)
    )
  ]);

  if (urlResult.error) {
    throw new Error(`Existing-story URL query failed: ${urlResult.error.message}`);
  }

  if (idResult.error) {
    throw new Error(`Existing-story ID query failed: ${idResult.error.message}`);
  }

  const byUrl = new Map(
    ((urlResult.data ?? []) as ExistingStoryRow[]).map((story) => [story.url, story])
  );
  const byId = new Map(
    ((idResult.data ?? []) as ExistingStoryRow[]).map((story) => [story.id, story])
  );
  const storiesToEnrich: NormalizedStory[] = [];
  let alreadyExistingCount = 0;

  for (const story of candidates) {
    const existing = byUrl.get(story.url) ?? byId.get(story.id);

    if (existing && storyContentIsUnchanged(story, existing)) {
      alreadyExistingCount += 1;
      continue;
    }

    storiesToEnrich.push(
      existing && byUrl.has(story.url)
        ? {
            ...story,
            id: existing.id,
            created_at: existing.created_at
          }
        : story
    );
  }

  return {
    storiesToEnrich,
    alreadyExistingCount
  };
}

function getBatchSize(limit?: number) {
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return Math.min(Math.floor(limit), 20);
  }

  const raw = Number(process.env.ENRICH_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);

  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(Math.floor(raw), 20);
}

export async function readNormalizedStories() {
  const content = await fs.readFile(NORMALIZED_INPUT_PATH, "utf8");
  return JSON.parse(content) as NormalizedStory[];
}

export async function writeEnrichedStories(stories: Story[]) {
  await fs.mkdir(path.dirname(ENRICHED_OUTPUT_PATH), { recursive: true });
  await fs.writeFile(ENRICHED_OUTPUT_PATH, JSON.stringify(stories, null, 2));
}

export async function upsertStories(stories: Story[]): Promise<UpsertStoriesResult> {
  const languageEligibility = partitionStoriesByEnglishEligibility(stories);
  stories = languageEligibility.eligibleStories;

  if (stories.length === 0) {
    return {
      insertedCount: 0,
      updatedCount: 0,
      nonEnglishRejectedCount: languageEligibility.rejectedStories.length
    };
  }

  const supabase = getSupabaseServiceClient();
  const ids = stories.map((story) => story.id);
  const { data: existingRows, error: existingError } = await supabase
    .from("stories")
    .select("id")
    .in("id", ids);

  if (existingError) {
    throw existingError;
  }

  const existingIds = new Set((existingRows ?? []).map((row) => row.id));
  const payload = stories.map((story) => ({
    id: story.id,
    title: normalizeExternalText(story.title, { stripHtml: true }),
    url: story.url,
    source: normalizeExternalText(story.source, { stripHtml: true }),
    source_type: story.source_type,
    published_at: story.published_at,
    summary: normalizeExternalText(story.summary, { stripHtml: true }),
    why_it_matters: normalizeExternalText(story.why_it_matters, { stripHtml: true }),
    tag: story.tag,
    score: story.score,
    raw_snippet:
      normalizeExternalText(story.raw_snippet, { stripHtml: true }) ?? null,
    image_url: story.image_url ?? null,
    read_time: story.read_time ?? null,
    is_top_signal: story.is_top_signal ?? false,
    status: story.status ?? "published",
    created_at: story.created_at,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase.from("stories").upsert(payload, {
    onConflict: "id"
  });

  if (error) {
    throw error;
  }

  const updatedCount = stories.filter((story) => existingIds.has(story.id)).length;
  const insertedCount = stories.length - updatedCount;

  return {
    insertedCount,
    updatedCount,
    nonEnglishRejectedCount: languageEligibility.rejectedStories.length
  };
}

export function isPublishedStoryExpired(
  story: Pick<Story, "published_at" | "status">,
  now = Date.now()
) {
  return (
    story.status === "published" &&
    Date.parse(story.published_at) < now - RETENTION_HOURS * 60 * 60 * 1000
  );
}

export function selectExcessPublishedStories(
  stories: Story[],
  limit = MAX_PUBLISHED_STORIES_PER_SOURCE,
  now = Date.now()
) {
  const bySource = new Map<string, Story[]>();

  for (const story of stories) {
    if (story.status !== "published") {
      continue;
    }

    const sourceStories = bySource.get(story.source) ?? [];
    sourceStories.push(story);
    bySource.set(story.source, sourceStories);
  }

  const excess: Story[] = [];

  for (const sourceStories of bySource.values()) {
    sourceStories.sort((left, right) => {
      const rankDifference =
        computeStoryRankScore(right, now) - computeStoryRankScore(left, now);

      if (rankDifference !== 0) {
        return rankDifference;
      }

      const publishedDifference =
        Date.parse(right.published_at) - Date.parse(left.published_at);

      return publishedDifference !== 0
        ? publishedDifference
        : left.id.localeCompare(right.id);
    });
    excess.push(...sourceStories.slice(limit));
  }

  return excess;
}

export async function enforcePublishedSourceInventoryCap(): Promise<SourceInventoryCleanupResult> {
  const supabase = getSupabaseServiceClient();
  const result = await supabase
    .from("stories")
    .select(
      "id, title, url, source, source_type, published_at, summary, why_it_matters, tag, score, raw_snippet, image_url, read_time, is_top_signal, status, created_at, updated_at"
    )
    .eq("status", "published");

  if (result.error) {
    throw result.error;
  }

  const excess = selectExcessPublishedStories((result.data ?? []) as Story[]);
  const idsBySource = new Map<string, string[]>();

  for (const story of excess) {
    const ids = idsBySource.get(story.source) ?? [];
    ids.push(story.id);
    idsBySource.set(story.source, ids);
  }

  let deletedCount = 0;

  for (const [source, ids] of idsBySource) {
    const deletion = await supabase
      .from("stories")
      .delete({ count: "exact" })
      .eq("status", "published")
      .eq("source", source)
      .in("id", ids);

    if (deletion.error) {
      throw deletion.error;
    }

    deletedCount += deletion.count ?? 0;
  }

  console.log(
    `[cleanup] deleted ${deletedCount} excess published stories across ${idsBySource.size} sources`
  );

  return {
    deletedCount,
    affectedSources: idsBySource.size
  };
}

export async function cleanupOldStories(now = Date.now()): Promise<CleanupStoriesResult> {
  const supabase = getSupabaseServiceClient();
  const cutoffDate = new Date(now - RETENTION_HOURS * 60 * 60 * 1000);
  const cutoffTimestamp = cutoffDate.toISOString();

  console.log(`[cleanup] deleting published stories older than ${cutoffTimestamp}`);

  const { count, error } = await supabase
    .from("stories")
    .delete({ count: "exact" })
    .eq("status", "published")
    .lt("published_at", cutoffTimestamp);

  if (error) {
    throw error;
  }

  const deletedCount = count ?? 0;
  console.log(`[cleanup] deleted ${deletedCount} rows using cutoff ${cutoffTimestamp}`);

  return {
    deletedCount,
    cutoffTimestamp
  };
}

export async function enrichStoryForModel(
  client: ReturnType<typeof getOpenAIClient>,
  story: NormalizedStory,
  requestedModel?: string
): Promise<
  | {
      enrichment: StoryEnrichment;
      attempts: number;
      usage: AiUsageSummary;
    }
  | {
      enrichment: null;
      attempts: number;
      reason: string;
      usage: AiUsageSummary;
    }
> {
  const model = getOpenAIModel(requestedModel);
  const usage = createAiUsageSummary(model);
  let lastFailureReason = "invalid enrichment payload";

  for (let attempt = 0; attempt < MAX_ENRICHMENT_ATTEMPTS; attempt += 1) {
    usage.requestCount += 1;

    if (attempt > 0) {
      usage.retryCount += 1;
    }

    const startedAt = performance.now();
    let receivedResponse = false;

    try {
      const response = await client.responses.create({
        model,
        ...getReasoningConfig(model),
        max_output_tokens: MAX_OUTPUT_TOKENS,
        instructions: STRATEGIST_BRIEFING_SYSTEM_PROMPT,
        input:
          attempt === 0
            ? buildStoryEnrichmentPrompt(story)
            : `${buildStoryEnrichmentPrompt(story)}\n\nCorrection: ${buildRetryGuidance(
                lastFailureReason
              )}`,
        text: {
          format: {
            type: "json_schema",
            name: "signal_noise_story_enrichment",
            strict: true,
            schema: enrichmentSchema
          }
        }
      });
      receivedResponse = true;

      usage.inputTokens += response.usage?.input_tokens ?? 0;
      usage.outputTokens += response.usage?.output_tokens ?? 0;

      if (!response.output_text) {
        lastFailureReason = "model returned an empty response";
        continue;
      }

      const parsed = parseEnrichmentPayload(response.output_text);
      const validated = validateStoryEnrichmentDetailed(parsed);

      if (validated.success) {
        return {
          enrichment: validated.value,
          attempts: attempt + 1,
          usage
        };
      }

      lastFailureReason = validated.error;
    } catch (error) {
      lastFailureReason =
        error instanceof Error ? error.message : "response was not valid JSON";

      if (!receivedResponse) {
        const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
        if (attempt + 1 < MAX_ENRICHMENT_ATTEMPTS && (!status || status === 429 || status >= 500)) continue;
        return {
          enrichment: null,
          attempts: attempt + 1,
          reason: lastFailureReason,
          usage
        };
      }
    } finally {
      usage.totalLatencyMs += Math.round(performance.now() - startedAt);
    }
  }

  return {
    enrichment: null,
    attempts: MAX_ENRICHMENT_ATTEMPTS,
    reason: lastFailureReason,
    usage
  };
}

function parseEnrichmentPayload(outputText: string) {
  const trimmed = outputText.trim();
  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(withoutFences);
  } catch {
    const start = withoutFences.indexOf("{");
    const end = withoutFences.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(withoutFences.slice(start, end + 1));
    }

    throw new Error("response was not valid JSON");
  }
}

export async function runEnrichmentPipeline(
  normalizedStories: NormalizedStory[],
  options?: { batchSize?: number; model?: string }
): Promise<EnrichmentRunResult> {
  const model = getOpenAIModel(options?.model);
  const languageEligibility = partitionStoriesByEnglishEligibility(normalizedStories);
  const batch = languageEligibility.eligibleStories.slice(0, getBatchSize(options?.batchSize));
  const enriched: Story[] = [];
  const skippedStories: Array<{ title: string; reason: string }> =
    languageEligibility.rejectedStories.map((story) => ({
      title: story.title,
      reason: `clearly non-English (${story.languageRejection.detectedLanguage ?? "unknown"})`
    }));
  const aiUsage = createAiUsageSummary(model);

  if (batch.length === 0) {
    return {
      enrichedStories: [],
      skippedStories,
      submittedCount: 0,
      nonEnglishRejectedCount: languageEligibility.rejectedStories.length,
      aiUsage
    };
  }

  const client = getOpenAIClient();

  await mapConcurrent(batch, 3, async (story) => {
    try {
      const result = await enrichStoryForModel(client, story, model);
      addAiUsage(aiUsage, result.usage);

      if (!result.enrichment) {
        console.warn(
          `[enrich] rejected after ${result.attempts} attempts: ${result.reason}`
        );
        skippedStories.push({
          title: story.title,
          reason: result.reason
        });
        return;
      }

      enriched.push({
        ...story,
        title: normalizeExternalText(story.title, { stripHtml: true }),
        raw_snippet: normalizeExternalText(story.raw_snippet, { stripHtml: true }),
        summary: normalizeExternalText(result.enrichment.summary, { stripHtml: true }),
        why_it_matters: normalizeExternalText(result.enrichment.why_it_matters, {
          stripHtml: true
        }),
        tag: result.enrichment.tag,
        score: result.enrichment.score,
        updated_at: new Date().toISOString()
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      console.warn(`[enrich] request failed: ${reason}`);
      skippedStories.push({
        title: story.title,
        reason
      });
    }
  });

  const originalOrder = new Map(batch.map((story, index) => [story.id, index]));
  enriched.sort((a, b) => originalOrder.get(a.id)! - originalOrder.get(b.id)!);
  return {
    enrichedStories: diversifyStoryScores(enriched),
    skippedStories,
    submittedCount: batch.length,
    nonEnglishRejectedCount: languageEligibility.rejectedStories.length,
    aiUsage
  };
}

export function printEnrichmentSummary(stories: Story[]) {
  console.log(`\nEnriched ${stories.length} stories:\n`);

  stories.forEach((story, index) => {
    console.log(`${index + 1}. ${story.title}`);
    console.log(`   ${story.tag} · ${story.score}`);
    console.log(`   Summary: ${story.summary}`);
    console.log(`   Why it matters: ${story.why_it_matters}`);
    console.log("");
  });
}

export const enrichedStoriesOutputPath = ENRICHED_OUTPUT_PATH;
