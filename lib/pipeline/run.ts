import { loadLocalEnv } from "@/lib/env";
import {
  cleanupOldStories,
  enforcePublishedSourceInventoryCap,
  filterExistingStories,
  runEnrichmentPipeline,
  upsertStories,
  writeEnrichedStories
} from "@/lib/pipeline/enrich";
import {
  printIngestionSummary,
  runIngestionPipeline,
  writeNormalizedStories
} from "@/lib/pipeline/ingest";

loadLocalEnv();

export type FullPipelineResult = {
  success: boolean;
  candidatesDiscovered: number;
  alreadyExistingSkipped: number;
  nonEnglishRejected: number;
  sentToAI: number;
  processedCount: number;
  enrichedCount: number;
  rejectedCount: number;
  writtenCount: number;
  insertedCount: number;
  updatedCount: number;
  deletedCount: number;
  retentionDeletedCount: number;
  sourceCapDeletedCount: number;
  retentionCutoff: string;
  sourceFailures: Array<{ source: string; error: string }>;
  skippedEnrichment: Array<{ title: string; reason: string }>;
  aiUsage: {
    model: string;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalLatencyMs: number;
    retryCount: number;
  };
};

type RunFullPipelineOptions = {
  writeDebugFiles?: boolean;
  batchSize?: number;
};

export async function runFullPipeline(options?: RunFullPipelineOptions) {
  const writeDebugFiles = options?.writeDebugFiles ?? false;

  console.log("[pipeline] start");

  console.log("[pipeline] ingestion start");
  const ingestion = await runIngestionPipeline();
  const sourceFailures = ingestion.sourceResults
    .filter((result) => result.error)
    .map((result) => ({
      source: result.source.name,
      error: result.error ?? "Unknown error"
    }));
  const ingestionNonEnglishRejected = ingestion.sourceResults.reduce(
    (total, result) => total + result.nonEnglishRejectedCount,
    0
  );

  console.log("[pipeline] ingestion complete");
  printIngestionSummary(ingestion.stories, ingestion.sourceResults, {
    includeStoryDetails: false
  });

  if (writeDebugFiles) {
    await writeNormalizedStories(ingestion.stories);
  }

  console.log("[pipeline] existing-story check start");
  const existingStoryFilter = await filterExistingStories(ingestion.stories);
  console.log(
    `[pipeline] existing-story check complete: skipped ${existingStoryFilter.alreadyExistingCount}`
  );

  console.log("[pipeline] enrichment start");
  const enrichment = await runEnrichmentPipeline(existingStoryFilter.storiesToEnrich, {
    batchSize: options?.batchSize
  });
  console.log("[pipeline] enrichment complete");

  console.log("[pipeline] upsert start");
  const upsert = await upsertStories(enrichment.enrichedStories);

  if (writeDebugFiles) {
    await writeEnrichedStories(enrichment.enrichedStories);
  }

  console.log(
    `[pipeline] upsert complete: inserted ${upsert.insertedCount}, updated ${upsert.updatedCount}`
  );

  console.log("[pipeline] cleanup start");
  const cleanup = await cleanupOldStories();
  console.log(
    `[pipeline] cleanup complete: deleted ${cleanup.deletedCount}, cutoff ${cleanup.cutoffTimestamp}`
  );

  console.log("[pipeline] source inventory cap start");
  const sourceInventoryCleanup = await enforcePublishedSourceInventoryCap();
  console.log(
    `[pipeline] source inventory cap complete: deleted ${sourceInventoryCleanup.deletedCount}`
  );

  const result = {
    success: true,
    candidatesDiscovered: ingestion.stories.length,
    alreadyExistingSkipped: existingStoryFilter.alreadyExistingCount,
    nonEnglishRejected:
      ingestionNonEnglishRejected +
      enrichment.nonEnglishRejectedCount +
      upsert.nonEnglishRejectedCount,
    sentToAI: enrichment.submittedCount,
    processedCount: ingestion.stories.length,
    enrichedCount: enrichment.enrichedStories.length,
    rejectedCount: enrichment.skippedStories.length,
    writtenCount: upsert.insertedCount + upsert.updatedCount,
    insertedCount: upsert.insertedCount,
    updatedCount: upsert.updatedCount,
    deletedCount: cleanup.deletedCount + sourceInventoryCleanup.deletedCount,
    retentionDeletedCount: cleanup.deletedCount,
    sourceCapDeletedCount: sourceInventoryCleanup.deletedCount,
    retentionCutoff: cleanup.cutoffTimestamp,
    sourceFailures,
    skippedEnrichment: enrichment.skippedStories,
    aiUsage: enrichment.aiUsage
  } satisfies FullPipelineResult;

  console.log(
    "[pipeline.metrics]",
    JSON.stringify({
      candidatesDiscovered: result.candidatesDiscovered,
      alreadyExistingSkipped: result.alreadyExistingSkipped,
      nonEnglishRejected: result.nonEnglishRejected,
      sentToAI: result.sentToAI,
      enriched: result.enrichedCount,
      rejected: result.rejectedCount,
      written: result.writtenCount,
      ai: result.aiUsage
    })
  );

  return result;
}
