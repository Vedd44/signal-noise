import { loadLocalEnv } from "@/lib/env";
import {
  printEnrichmentSummary,
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
  processedCount: number;
  enrichedCount: number;
  insertedCount: number;
  updatedCount: number;
  sourceFailures: Array<{ source: string; error: string }>;
  skippedEnrichment: Array<{ title: string; reason: string }>;
};

export async function runFullPipeline() {
  console.log("[pipeline] start");

  const ingestion = await runIngestionPipeline();
  const sourceFailures = ingestion.sourceResults
    .filter((result) => result.error)
    .map((result) => ({
      source: result.source.name,
      error: result.error ?? "Unknown error"
    }));

  console.log("[pipeline] ingestion complete");
  printIngestionSummary(ingestion.stories, ingestion.sourceResults);
  await writeNormalizedStories(ingestion.stories);

  console.log("[pipeline] enrichment start");
  const enrichment = await runEnrichmentPipeline(ingestion.stories);
  enrichment.skippedStories.forEach(({ title, reason }) => {
    console.warn(`[pipeline] skipped enrichment: ${title} (${reason})`);
  });

  const upsert = await upsertStories(enrichment.enrichedStories);
  await writeEnrichedStories(enrichment.enrichedStories);

  console.log(
    `[pipeline] upsert complete: inserted ${upsert.insertedCount}, updated ${upsert.updatedCount}`
  );
  printEnrichmentSummary(enrichment.enrichedStories);

  return {
    success: true,
    processedCount: ingestion.stories.length,
    enrichedCount: enrichment.enrichedStories.length,
    insertedCount: upsert.insertedCount,
    updatedCount: upsert.updatedCount,
    sourceFailures,
    skippedEnrichment: enrichment.skippedStories
  } satisfies FullPipelineResult;
}
