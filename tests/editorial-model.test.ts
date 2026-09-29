import assert from "node:assert/strict";
import test from "node:test";

import {
  enrichStoryForModel,
  getOpenAIModel
} from "@/lib/pipeline/enrich";
import {
  buildStoryEnrichmentPrompt,
  STRATEGIST_BRIEFING_SYSTEM_PROMPT
} from "@/lib/prompts";
import type { NormalizedStory } from "@/types/story";

const story: NormalizedStory = {
  id: "editorial-model-test",
  title: "A narrowly scoped product announcement",
  url: "https://example.com/story",
  source: "Example Newsroom",
  source_type: "primary",
  published_at: "2026-09-23T12:00:00.000Z",
  raw_snippet: "The company announced a narrowly scoped product change.",
  created_at: "2026-09-23T12:01:00.000Z"
};

test("production editorial model resolves to GPT-6 Luna", () => {
  const previousModel = process.env.OPENAI_MODEL;
  delete process.env.OPENAI_MODEL;

  try {
    assert.equal(getOpenAIModel(), "gpt-6-luna");
  } finally {
    if (previousModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = previousModel;
    }
  }
});

test("GPT-6 Luna receives the unchanged structured Responses request with none reasoning", async () => {
  let request: Record<string, unknown> | undefined;
  const client = {
    responses: {
      create: async (value: Record<string, unknown>) => {
        request = value;
        return {
          output_text: JSON.stringify({
            summary: "The company announced a narrowly scoped product change.",
            why_it_matters: "The change is narrow and the supplied evidence supports no broader conclusion.",
            tag: "Product",
            score: 60
          }),
          usage: {
            input_tokens: 1,
            output_tokens: 1
          }
        };
      }
    }
  } as never;

  const result = await enrichStoryForModel(client, story, "gpt-6-luna");

  assert.ok(result.enrichment);
  assert.ok(request);
  assert.deepEqual(request, {
    model: "gpt-6-luna",
    reasoning: { effort: "none" },
    max_output_tokens: 300,
    instructions: STRATEGIST_BRIEFING_SYSTEM_PROMPT,
    input: buildStoryEnrichmentPrompt(story),
    text: {
      format: {
        type: "json_schema",
        name: "signal_noise_story_enrichment",
        strict: true,
        schema: (request.text as { format: { schema: unknown } }).format.schema
      }
    }
  });
  assert.deepEqual(Object.keys(request).sort(), [
    "input",
    "instructions",
    "max_output_tokens",
    "model",
    "reasoning",
    "text"
  ]);
});
