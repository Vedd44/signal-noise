import fs from "node:fs/promises";
import path from "node:path";

import { getSupabaseServiceClient } from "@/lib/db";
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
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.2";
const MAX_ENRICHMENT_ATTEMPTS = 2;

const enrichmentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "why_it_matters", "tag", "score"],
  properties: {
    summary: {
      type: "string",
      description: "A concise 1-2 sentence strategist summary."
    },
    why_it_matters: {
      type: "string",
      description:
        "Exactly one sentence about the business, media, platform, audience, or digital strategy implication."
    },
    tag: {
      type: "string",
      enum: STORY_TAGS
    },
    score: {
      type: "integer",
      description: "Signal strength from 1 to 100."
    }
  }
} as const;

export type EnrichmentRunResult = {
  enrichedStories: Story[];
  skippedStories: Array<{ title: string; reason: string }>;
};

export type UpsertStoriesResult = {
  insertedCount: number;
  updatedCount: number;
};

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
  if (stories.length === 0) {
    return {
      insertedCount: 0,
      updatedCount: 0
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
    title: story.title,
    url: story.url,
    source: story.source,
    source_type: story.source_type,
    published_at: story.published_at,
    summary: story.summary,
    why_it_matters: story.why_it_matters,
    tag: story.tag,
    score: story.score,
    raw_snippet: story.raw_snippet ?? null,
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
    updatedCount
  };
}

async function enrichStory(
  client: ReturnType<typeof getOpenAIClient>,
  story: NormalizedStory
): Promise<
  | {
      enrichment: StoryEnrichment;
      attempts: number;
    }
  | {
      enrichment: null;
      attempts: number;
      reason: string;
    }
> {
  let lastFailureReason = "invalid enrichment payload";

  for (let attempt = 0; attempt < MAX_ENRICHMENT_ATTEMPTS; attempt += 1) {
    const response = await client.responses.create({
      model: DEFAULT_MODEL,
      instructions: STRATEGIST_BRIEFING_SYSTEM_PROMPT,
      input:
        attempt === 0
          ? buildStoryEnrichmentPrompt(story)
          : `${buildStoryEnrichmentPrompt(
              story
            )}\n\nRetry guidance: the previous answer failed validation. Fix this specific issue and return only a valid JSON object: ${lastFailureReason}. Keep the same voice: concise, restrained, specific, and strategist-grade.`,
      text: {
        format: {
          type: "json_schema",
          name: "signal_noise_story_enrichment",
          strict: true,
          schema: enrichmentSchema
        }
      }
    });

    if (!response.output_text) {
      lastFailureReason = "model returned an empty response";
      continue;
    }

    try {
      const parsed = parseEnrichmentPayload(response.output_text);
      const validated = validateStoryEnrichmentDetailed(parsed);

      if (validated.success) {
        return {
          enrichment: validated.value,
          attempts: attempt + 1
        };
      }

      lastFailureReason = validated.error;
    } catch (error) {
      lastFailureReason =
        error instanceof Error ? error.message : "response was not valid JSON";
      continue;
    }
  }

  return {
    enrichment: null,
    attempts: MAX_ENRICHMENT_ATTEMPTS,
    reason: lastFailureReason
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
  options?: { batchSize?: number }
): Promise<EnrichmentRunResult> {
  const client = getOpenAIClient();
  const batch = normalizedStories.slice(0, getBatchSize(options?.batchSize));
  const enriched: Story[] = [];
  const skippedStories: Array<{ title: string; reason: string }> = [];

  for (const story of batch) {
    try {
      const result = await enrichStory(client, story);

      if (!result.enrichment) {
        console.warn(
          `[enrich] skipped "${story.title}" after ${result.attempts} attempts: ${result.reason}`
        );
        skippedStories.push({
          title: story.title,
          reason: result.reason
        });
        continue;
      }

      enriched.push({
        ...story,
        ...result.enrichment
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      console.warn(`[enrich] skipped "${story.title}": ${reason}`);
      skippedStories.push({
        title: story.title,
        reason
      });
    }
  }

  return {
    enrichedStories: diversifyStoryScores(enriched),
    skippedStories
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
