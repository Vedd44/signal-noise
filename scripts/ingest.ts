import { loadLocalEnv } from "../lib/env";
import {
  normalizedStoriesOutputPath,
  printIngestionSummary,
  runIngestionPipeline,
  writeNormalizedStories
} from "../lib/pipeline/ingest";

loadLocalEnv();

async function main() {
  console.log(".env.local loaded for local scripts");
  console.log("Starting Signal > Noise ingestion pipeline...\n");

  const { stories, sourceResults } = await runIngestionPipeline();

  printIngestionSummary(stories, sourceResults);
  await writeNormalizedStories(stories);

  console.log(`Saved ${stories.length} normalized stories to ${normalizedStoriesOutputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
