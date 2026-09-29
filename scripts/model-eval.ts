import fs from "node:fs/promises";
import path from "node:path";

import { loadLocalEnv } from "../lib/env";
import { getOpenAIClient } from "../lib/openai";
import { normalizeExternalText } from "../lib/pipeline/cleanText";
import {
  enrichStoryForModel,
  readNormalizedStories
} from "../lib/pipeline/enrich";
import type { NormalizedStory } from "../types/story";

loadLocalEnv();

const terraOnly = process.argv.includes("--terra-only");
const OUTPUT_PATH = path.join(
  process.cwd(),
  "tmp",
  terraOnly ? "editorial-eval.json" : "model-eval.json"
);
const SAMPLE_IDS = [
  "stratechery-openai-buys-tbpn-tech-and-the-token-tsunami-https-stratechery-com-20",
  "digital-trends-your-favorite-apps-might-be-watching-you-the-fbi-s-warning-isn-t-",
  "google-ai-blog-new-ways-to-balance-cost-and-reliability-in-the-gemini-api-https-",
  "engadget-apple-will-again-appeal-to-the-supreme-court-in-battle-with-epic-games-",
  "techcrunch-google-quietly-launched-an-ai-dictation-app-that-works-offline-https-",
  "digital-trends-if-samsung-launches-a-galaxy-s27-pro-the-name-alone-won-t-save-it",
  "the-verge-robotaxi-companies-won-t-say-how-often-remote-operators-intervene-http",
  "meta-newsroom-introducing-our-first-ai-glasses-built-for-prescriptions-https-abo",
  "engadget-netflix-just-released-a-standalone-gaming-app-for-kids-https-www-engadg",
  "techcrunch-north-korea-s-hijack-of-one-of-the-web-s-most-used-open-source-projec",
  "digital-trends-whatsapp-calls-are-about-to-get-a-lot-better-with-noise-cancellat",
  "wired-8-best-apple-watch-accessories-2026-bands-chargers-and-more-https-www-wire",
  "wired-the-doj-misled-a-judge-about-how-it-s-using-voter-roll-data-https-www-wire"
] as const;

const MODELS = [
  {
    model: "gpt-5.2",
    reasoningEffort: "none (model default)",
    inputUsdPerMillionTokens: 1.75,
    outputUsdPerMillionTokens: 14
  },
  {
    model: "gpt-5.6-terra",
    reasoningEffort: "none",
    inputUsdPerMillionTokens: 2,
    outputUsdPerMillionTokens: 12
  },
  {
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    inputUsdPerMillionTokens: 0.2,
    outputUsdPerMillionTokens: 1.2
  }
] as const;

const EDITORIAL_CRITERIA = [
  "factual grounding in supplied RSS content",
  "concise summary",
  "useful editorial judgment",
  'non-generic "why it matters"',
  "no AI-sounding filler",
  "correct category/tag",
  "sensible score",
  "consistent tone",
  "no invented details"
] as const;

function normalizeStory(story: NormalizedStory): NormalizedStory {
  return {
    ...story,
    title: normalizeExternalText(story.title, { stripHtml: true }),
    source: normalizeExternalText(story.source, { stripHtml: true }),
    raw_snippet: normalizeExternalText(story.raw_snippet, { stripHtml: true })
  };
}

function getEvaluationSample(stories: NormalizedStory[]) {
  const storiesById = new Map(stories.map((story) => [story.id, story]));
  const missingIds = SAMPLE_IDS.filter((id) => !storiesById.has(id));

  if (missingIds.length > 0) {
    throw new Error(
      `The deterministic evaluation sample is missing ${missingIds.length} stories from data/normalized-stories.json. Run the evaluation against the audited sample file or update SAMPLE_IDS deliberately.`
    );
  }

  return SAMPLE_IDS.map((id) => normalizeStory(storiesById.get(id)!));
}

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  inputRate: number,
  outputRate: number
) {
  return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
}

async function main() {
  const stories = getEvaluationSample(await readNormalizedStories());
  const client = getOpenAIClient();
  const modelResults = [];
  const selectedModels = terraOnly
    ? MODELS.filter(({ model }) => model === "gpt-5.6-terra")
    : MODELS;

  for (const modelConfig of selectedModels) {
    const results = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalLatencyMs = 0;
    let totalRequests = 0;
    let totalRetries = 0;
    let successfulStories = 0;
    let rejectedStories = 0;

    console.log(`Evaluating ${modelConfig.model} on ${stories.length} stories...`);

    for (const story of stories) {
      const result = await enrichStoryForModel(client, story, modelConfig.model);
      const estimatedCostUsd = estimateCost(
        result.usage.inputTokens,
        result.usage.outputTokens,
        modelConfig.inputUsdPerMillionTokens,
        modelConfig.outputUsdPerMillionTokens
      );

      totalInputTokens += result.usage.inputTokens;
      totalOutputTokens += result.usage.outputTokens;
      totalLatencyMs += result.usage.totalLatencyMs;
      totalRequests += result.usage.requestCount;
      totalRetries += result.usage.retryCount;

      if (result.enrichment) {
        successfulStories += 1;
      } else {
        rejectedStories += 1;
      }

      results.push({
        storyId: story.id,
        enrichment: result.enrichment,
        failureReason: result.enrichment ? null : result.reason,
        attempts: result.attempts,
        latencyMs: result.usage.totalLatencyMs,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        estimatedCostUsd,
        humanReview: Object.fromEntries(
          EDITORIAL_CRITERIA.map((criterion) => [criterion, null])
        )
      });
    }

    modelResults.push({
      model: modelConfig.model,
      reasoningEffort: modelConfig.reasoningEffort,
      pricingUsdPerMillionTokens: {
        input: modelConfig.inputUsdPerMillionTokens,
        output: modelConfig.outputUsdPerMillionTokens
      },
      totals: {
        successfulStories,
        rejectedStories,
        requestCount: totalRequests,
        retryCount: totalRetries,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        latencyMs: totalLatencyMs,
        estimatedCostUsd: estimateCost(
          totalInputTokens,
          totalOutputTokens,
          modelConfig.inputUsdPerMillionTokens,
          modelConfig.outputUsdPerMillionTokens
        )
      },
      results
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    pricingReferenceDate: "2026-09-03",
    note: "Scores are validated model outputs before production score calibration and source-diversity adjustments.",
    mode: terraOnly ? "terra-only" : "multi-model",
    editorialCriteria: EDITORIAL_CRITERIA,
    sample: stories,
    models: modelResults
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Saved model comparison to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
