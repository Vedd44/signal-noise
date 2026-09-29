import assert from "node:assert/strict";
import test from "node:test";

import { runEnrichmentPipeline, upsertStories } from "@/lib/pipeline/enrich";
import { evaluateEnglishLanguageEligibility } from "@/lib/pipeline/language";
import type { NormalizedStory, Story } from "@/types/story";

const FRENCH_META_HEADLINE =
  "Présentation de Meta One : Un service d’abonnement offrant davantage de fonctionnalités et d’IA pour créer, se connecter et se démarquer";

function candidate(title: string, overrides: Partial<NormalizedStory> = {}): NormalizedStory {
  return {
    id: "language-test",
    title,
    url: "https://about.fb.com/news/2026/09/example-story/",
    source: "Meta Newsroom",
    source_type: "primary",
    published_at: "2026-09-15T15:25:57.000Z",
    raw_snippet: "A sufficiently detailed source excerpt for the language eligibility test.",
    created_at: "2026-09-15T15:30:00.000Z",
    ...overrides
  };
}

test("current French Meta headline is rejected despite misleading en-US feed metadata", () => {
  const result = evaluateEnglishLanguageEligibility(
    candidate(FRENCH_META_HEADLINE, { feed_language: "en-US" })
  );

  assert.equal(result.eligible, false);
  assert.equal(result.detectedLanguage, "fr");
});

test("normal English Meta headline is accepted", () => {
  const result = evaluateEnglishLanguageEligibility(
    candidate("Introducing Meta One: A Subscription Service With More Features and AI to Create, Connect, and Stand Out")
  );

  assert.equal(result.eligible, true);
  assert.equal(result.reason, "english");
});

test("English headline containing an accented proper noun is accepted", () => {
  assert.equal(
    evaluateEnglishLanguageEligibility(
      candidate("Beyoncé launches new AI tools for creators in Montréal")
    ).eligible,
    true
  );
});

test("English headline containing foreign company, person, and product names is accepted", () => {
  assert.equal(
    evaluateEnglishLanguageEligibility(
      candidate("Société Générale hires José Álvarez to lead Qwen product strategy")
    ).eligible,
    true
  );
});

test("clearly Spanish headline is rejected", () => {
  const result = evaluateEnglishLanguageEligibility(
    candidate("Meta presenta nuevas funciones de IA para las empresas")
  );
  assert.equal(result.eligible, false);
  assert.equal(result.detectedLanguage, "es");
});

test("clearly German headline is rejected", () => {
  const result = evaluateEnglishLanguageEligibility(
    candidate("Meta kündigt neue KI-Funktionen für Unternehmen und Nutzer an")
  );
  assert.equal(result.eligible, false);
  assert.equal(result.detectedLanguage, "de");
});

test("ambiguous short headline is preserved", () => {
  const result = evaluateEnglishLanguageEligibility(candidate("Meta One"));
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "ambiguous");
});

test("explicit non-English item metadata and locale URLs are rejected", () => {
  assert.equal(
    evaluateEnglishLanguageEligibility(candidate("Meta One launch", { item_language: "fr-FR" }))
      .eligible,
    false
  );
  assert.equal(
    evaluateEnglishLanguageEligibility(
      candidate("Meta One launch", { url: "https://example.com/fr/news/meta-one" })
    ).eligible,
    false
  );
  assert.equal(
    evaluateEnglishLanguageEligibility(
      candidate("AI agents launch", { url: "https://example.com/ai/agents-launch" })
    ).eligible,
    true
  );
});

test("unknown, multilingual, ISO English metadata, and UK market paths are preserved", () => {
  for (const feed_language of ["und", "mul", "eng", "English"]) {
    assert.equal(
      evaluateEnglishLanguageEligibility(candidate("Meta One", { feed_language })).eligible,
      true
    );
  }

  assert.equal(
    evaluateEnglishLanguageEligibility(
      candidate("Meta launches AI tools in the UK", {
        url: "https://example.com/uk/news/meta-ai-tools"
      })
    ).eligible,
    true
  );
});

test("clearly non-English non-Latin-script headlines are rejected conservatively", () => {
  assert.equal(
    evaluateEnglishLanguageEligibility(candidate("新しい人工知能サービスを発表しました"))
      .eligible,
    false
  );
  assert.equal(
    evaluateEnglishLanguageEligibility(candidate("OpenAI launches GPT in 東京")).eligible,
    true
  );
});

test("rejected story reaches neither OpenAI nor Supabase", async () => {
  const rejected = candidate(FRENCH_META_HEADLINE, { feed_language: "en-US" });
  const enrichment = await runEnrichmentPipeline([rejected]);

  assert.equal(enrichment.submittedCount, 0);
  assert.equal(enrichment.aiUsage.requestCount, 0);
  assert.equal(enrichment.nonEnglishRejectedCount, 1);
  assert.deepEqual(enrichment.enrichedStories, []);

  const wouldBePublished: Story = {
    ...rejected,
    summary: "English summary that must never be written.",
    why_it_matters: "English signal that must never be written.",
    tag: "AI",
    score: 90,
    status: "published",
    updated_at: rejected.created_at
  };
  const upsert = await upsertStories([wouldBePublished]);

  assert.deepEqual(upsert, {
    insertedCount: 0,
    updatedCount: 0,
    nonEnglishRejectedCount: 1
  });
});
