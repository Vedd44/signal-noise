import { getSupabaseServiceClient } from "@/lib/db";
import { retrySubmissionNotifications } from "@/lib/submissions";
import { mapConcurrent } from "@/lib/pipeline/concurrency";
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
import { hasEnoughEvidence, hydrateStorySource } from "@/lib/pipeline/sourceContent";

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

  const ingestion = await runIngestionPipeline();
  if (ingestion.sourceResults.every(result => result.error)) throw new Error('All ingestion sources failed');
  const sourceFailures = ingestion.sourceResults
    .filter((result) => result.error)
    .map((result) => ({ source: result.source.name, error: result.error ?? "Unknown error" }));
  const ingestionNonEnglishRejected = ingestion.sourceResults.reduce(
    (total, result) => total + result.nonEnglishRejectedCount, 0
  );

  printIngestionSummary(ingestion.stories, ingestion.sourceResults, { includeStoryDetails: false });
  if (writeDebugFiles) await writeNormalizedStories(ingestion.stories);

  const existingStoryFilter = await filterExistingStories(ingestion.stories);
  console.log(`[pipeline] existing-story check complete: skipped ${existingStoryFilter.alreadyExistingCount}`);

  console.log("[pipeline] source retrieval start");
  const sourceHydrated = await mapConcurrent(existingStoryFilter.storiesToEnrich, 5, hydrateStorySource);
  const evidenceRejected = sourceHydrated.filter((story) => !hasEnoughEvidence(story));
  const storiesWithEvidence = sourceHydrated.filter(hasEnoughEvidence);
  console.log(
    `[pipeline] source retrieval complete: full source ${sourceHydrated.filter((story) => story.source_fetch_status === "full-source").length}, fallback ${sourceHydrated.filter((story) => story.source_fetch_status !== "full-source").length}, rejected ${evidenceRejected.length}`
  );

  const enrichment = await runEnrichmentPipeline(storiesWithEvidence, {
    batchSize: options?.batchSize
  });

  if (enrichment.submittedCount > 0 && enrichment.enrichedStories.length === 0) throw new Error('All editorial generations failed validation or transport');
  const upsert = await upsertStories(enrichment.enrichedStories);
  if (writeDebugFiles) await writeEnrichedStories(enrichment.enrichedStories);

  const cleanup = await cleanupOldStories();
  const sourceInventoryCleanup = await enforcePublishedSourceInventoryCap();
  const evidenceSkips = evidenceRejected.map((story) => ({
    title: story.title,
    reason: `insufficient source evidence (${story.source_fetch_status ?? "feed-only"})`
  }));
  const skippedEnrichment = [...evidenceSkips, ...enrichment.skippedStories];

  const result = {
    success: true,
    candidatesDiscovered: ingestion.stories.length,
    alreadyExistingSkipped: existingStoryFilter.alreadyExistingCount,
    nonEnglishRejected:
      ingestionNonEnglishRejected + enrichment.nonEnglishRejectedCount + upsert.nonEnglishRejectedCount,
    sentToAI: enrichment.submittedCount,
    processedCount: ingestion.stories.length,
    enrichedCount: enrichment.enrichedStories.length,
    rejectedCount: skippedEnrichment.length,
    writtenCount: upsert.insertedCount + upsert.updatedCount,
    insertedCount: upsert.insertedCount,
    updatedCount: upsert.updatedCount,
    deletedCount: cleanup.deletedCount + sourceInventoryCleanup.deletedCount,
    retentionDeletedCount: cleanup.deletedCount,
    sourceCapDeletedCount: sourceInventoryCleanup.deletedCount,
    retentionCutoff: cleanup.cutoffTimestamp,
    sourceFailures,
    skippedEnrichment,
    aiUsage: enrichment.aiUsage
  } satisfies FullPipelineResult;

  console.log("[pipeline.metrics]", JSON.stringify({
    candidatesDiscovered: result.candidatesDiscovered,
    alreadyExistingSkipped: result.alreadyExistingSkipped,
    sentToAI: result.sentToAI,
    enriched: result.enrichedCount,
    rejected: result.rejectedCount,
    written: result.writtenCount,
    ai: result.aiUsage
  }));
  return result;
}

/** Durable overlap prevention and a small operational history, with no source text or secrets. */
export async function runTrackedPipeline() {
  const db = getSupabaseServiceClient();
  const claim = await db.rpc('claim_pipeline_run');
  if (claim.error) throw new Error('Pipeline claim unavailable');
  if (!claim.data) return {success:true,status:'already-running'};
  try {
    const result = await runFullPipeline();
    const { error } = await db.from('pipeline_runs').update({ status:'succeeded', completed_at:new Date().toISOString(), metrics:{
      candidates:result.candidatesDiscovered,written:result.writtenCount,rejected:result.rejectedCount,
      sourceFailures:result.sourceFailures.map(f=>f.source), ai:result.aiUsage
    }}).eq('id',claim.data);
    if (error) throw new Error('Pipeline run recording failed');
    try { await retrySubmissionNotifications(); } catch { console.error('[pipeline] reader notifications pending'); }
    return result;
  } catch(error) {
    await db.from('pipeline_runs').update({status:'failed',completed_at:new Date().toISOString()}).eq('id',claim.data);
    throw error;
  }
}
