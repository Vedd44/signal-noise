import { loadLocalEnv } from "../lib/env";
import {
  enrichedStoriesOutputPath,
  printEnrichmentSummary,
  readNormalizedStories,
  runEnrichmentPipeline,
  upsertStories,
  writeEnrichedStories
} from "../lib/pipeline/enrich";

loadLocalEnv();

async function main() {
  const normalizedStories = await readNormalizedStories();

  console.log(".env.local loaded for local scripts");
  console.log(`Enriching ${normalizedStories.slice(0, 12).length} stories...\n`);

  const { enrichedStories, skippedStories } = await runEnrichmentPipeline(normalizedStories);

  skippedStories.forEach(({ title, reason }) => {
    console.warn(`- Skipped ${title} (${reason})`);
  });

  const { insertedCount, updatedCount } = await upsertStories(enrichedStories);

  await writeEnrichedStories(enrichedStories);
  printEnrichmentSummary(enrichedStories);

  console.log(`Upserted ${insertedCount} inserted and ${updatedCount} updated stories to Supabase`);
  console.log(`Saved ${enrichedStories.length} enriched stories to ${enrichedStoriesOutputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
