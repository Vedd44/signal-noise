import assert from "node:assert/strict";
import test from "node:test";

import {
  activeRssSources,
  isPremierEligibleAccessibility,
  rssSources,
  type SourceAccessibility
} from "@/lib/feeds";
import { passesSourceSpecificRelevanceGuard } from "@/lib/pipeline/ingest";
import {
  MAX_PUBLISHED_STORIES_PER_SOURCE,
  RETENTION_HOURS,
  isPublishedStoryExpired,
  selectExcessPublishedStories
} from "@/lib/pipeline/enrich";
import { computeStoryRankScore } from "@/lib/utils";
import type { NormalizedStory, Story } from "@/types/story";

const NOW = new Date("2026-09-04T12:00:00.000Z").getTime();

function makeStory(index: number, overrides: Partial<Story> = {}): Story {
  const publishedAt = new Date(NOW - index * 60 * 60 * 1000).toISOString();

  return {
    id: `inventory-story-${index}`,
    title: `Inventory story ${index}`,
    url: `https://example.com/inventory-story-${index}`,
    source: "Example Source",
    source_type: "reporting",
    published_at: publishedAt,
    summary: `Summary ${index}.`,
    why_it_matters: `Why it matters ${index}.`,
    tag: "Strategy",
    score: 80,
    status: "published",
    created_at: publishedAt,
    updated_at: publishedAt,
    ...overrides
  };
}

function makeCandidate(
  source: "404 Media" | "The Register" | "The New Stack",
  title: string,
  rawSnippet: string
): NormalizedStory {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    url: "https://example.com/candidate",
    source,
    source_type: "reporting",
    published_at: new Date(NOW).toISOString(),
    raw_snippet: rawSnippet,
    created_at: new Date(NOW).toISOString()
  };
}

test("V2 config contains exactly the approved 17-source roster", () => {
  assert.equal(rssSources.length, 17);
  assert.deepEqual(
    rssSources.map((source) => source.name),
    [
      "OpenAI",
      "Google AI Blog",
      "Meta Newsroom",
      "Apple Newsroom",
      "Platformer",
      "TechCrunch",
      "The Verge",
      "WIRED",
      "Ars Technica",
      "Stratechery",
      "MIT Technology Review",
      "IEEE Spectrum",
      "The Register",
      "404 Media",
      "Rest of World",
      "Krebs on Security",
      "The New Stack"
    ]
  );
  assert.equal(rssSources.some((source) => source.name === "Engadget"), false);
  assert.equal(rssSources.some((source) => source.name === "Digital Trends"), false);
});

test("Stratechery remains classified for retained stories but is disabled for ingestion", () => {
  assert.equal(rssSources.find((source) => source.name === "Stratechery")?.enabled, false);
  assert.equal(activeRssSources.length, 16);
  assert.equal(activeRssSources.some((source) => source.name === "Stratechery"), false);
});

test("V2 config uses the approved source types, limits, and Ars section feed", () => {
  const expectedLimits = new Map([
    ["OpenAI", 2],
    ["Google AI Blog", 2],
    ["Meta Newsroom", 1],
    ["Apple Newsroom", 1],
    ["Platformer", 1],
    ["TechCrunch", 2],
    ["The Verge", 2],
    ["WIRED", 1],
    ["Ars Technica", 2],
    ["Stratechery", 1],
    ["MIT Technology Review", 2],
    ["IEEE Spectrum", 1],
    ["The Register", 1],
    ["404 Media", 1],
    ["Rest of World", 1],
    ["Krebs on Security", 1],
    ["The New Stack", 1]
  ]);

  for (const source of rssSources) {
    assert.equal(source.max_items_per_source, expectedLimits.get(source.name));
    assert.equal(
      source.source_type,
      source.name === "Stratechery"
        ? "analysis"
        : ["OpenAI", "Google AI Blog", "Meta Newsroom", "Apple Newsroom"].includes(
            source.name
          )
        ? "primary"
        : "reporting"
    );
  }

  const ars = rssSources.find((source) => source.name === "Ars Technica");
  assert.equal(ars?.rss_url, "https://feeds.arstechnica.com/arstechnica/technology-lab");
});

test("all V2 sources have approved static accessibility metadata", () => {
  const supported = new Set<SourceAccessibility>([
    "open",
    "mostly_open",
    "metered",
    "mostly_paywalled",
    "hard_paywall",
    "mixed",
    "unknown"
  ]);

  for (const source of rssSources) {
    assert.equal(supported.has(source.accessibility), true);
  }

  assert.equal(
    rssSources.find((source) => source.name === "The Verge")?.accessibility,
    "metered"
  );
  assert.equal(
    rssSources.find((source) => source.name === "Stratechery")?.accessibility,
    "mostly_paywalled"
  );
});

test("premier eligibility blocks mostly paywalled and hard-paywall access only", () => {
  assert.equal(isPremierEligibleAccessibility("mostly_paywalled"), false);
  assert.equal(isPremierEligibleAccessibility("hard_paywall"), false);
  assert.equal(isPremierEligibleAccessibility("metered"), true);
  assert.equal(isPremierEligibleAccessibility("mixed"), true);
  assert.equal(isPremierEligibleAccessibility("unknown"), true);
});

test("accessibility metadata does not influence ranking", () => {
  const verge = rssSources.find((source) => source.name === "The Verge");
  assert.ok(verge);
  const story = makeStory(0, { source: "The Verge", score: 88 });
  const originalAccessibility = verge.accessibility;
  const before = computeStoryRankScore(story, NOW);

  try {
    verge.accessibility = "unknown";
    assert.equal(computeStoryRankScore(story, NOW), before);
  } finally {
    verge.accessibility = originalAccessibility;
  }
});

test("retention is a hard 72-hour window regardless of score", () => {
  assert.equal(RETENTION_HOURS, 72);
  assert.equal(
    isPublishedStoryExpired(
      makeStory(73, { score: 100, published_at: new Date(NOW - 73 * 3600000).toISOString() }),
      NOW
    ),
    true
  );
  assert.equal(isPublishedStoryExpired(makeStory(71, { score: 60 }), NOW), false);
  assert.equal(isPublishedStoryExpired(makeStory(73, { status: "draft" }), NOW), false);
});

test("source inventory cap preserves the six strongest recent published stories", () => {
  assert.equal(MAX_PUBLISHED_STORIES_PER_SOURCE, 6);
  const sourceStories = Array.from({ length: 8 }, (_, index) =>
    makeStory(index, { score: 72 + index * 2 })
  );
  const expectedExcess = [...sourceStories]
    .sort((left, right) => {
      const rankDifference =
        computeStoryRankScore(right, NOW) - computeStoryRankScore(left, NOW);
      return rankDifference || Date.parse(right.published_at) - Date.parse(left.published_at);
    })
    .slice(6)
    .map((story) => story.id)
    .sort();

  assert.deepEqual(
    selectExcessPublishedStories(sourceStories, 6, NOW)
      .map((story) => story.id)
      .sort(),
    expectedExcess
  );
});

test("source inventory cap never selects non-published or other-source rows", () => {
  const published = Array.from({ length: 7 }, (_, index) => makeStory(index));
  const draft = makeStory(20, { id: "draft", status: "draft" });
  const otherSource = makeStory(21, { id: "other", source: "Other Source" });
  const excess = selectExcessPublishedStories([...published, draft, otherSource], 6, NOW);

  assert.equal(excess.length, 1);
  assert.equal(excess.some((story) => story.id === "draft"), false);
  assert.equal(excess.some((story) => story.id === "other"), false);
  assert.equal(excess.every((story) => story.source === "Example Source"), true);
});

test("404 Media off-topic science curiosity is rejected", () => {
  assert.equal(
    passesSourceSpecificRelevanceGuard(
      makeCandidate(
        "404 Media",
        "How the Hell Did an Island Suddenly Appear, Then Vanish?",
        "A floating island drew attention after a resident wondered whether one video might be AI-generated."
      )
    ),
    false
  );
});

test("404 Media privacy and platform reporting is accepted", () => {
  assert.equal(
    passesSourceSpecificRelevanceGuard(
      makeCandidate(
        "404 Media",
        "Flock taught cops how to surveil protesters",
        "The surveillance platform gave police new ways to search camera data."
      )
    ),
    true
  );
});

test("The Register routine sysadmin minutiae is rejected", () => {
  assert.equal(
    passesSourceSpecificRelevanceGuard(
      makeCandidate(
        "The Register",
        "Microsoft to bounce mail from outdated Exchange servers",
        "Administrators must install the final security update before their on-premises servers can send mail."
      )
    ),
    false
  );
});

test("The Register narrow vendor outage is rejected", () => {
  assert.equal(
    passesSourceSpecificRelevanceGuard(
      makeCandidate(
        "The Register",
        "Cloud snail-mail service Docmail enters third day stuck in the outbox",
        "The hosted service remains unavailable while its operator troubleshoots an operational fault."
      )
    ),
    false
  );
});

test("The Register major enterprise security story is accepted", () => {
  assert.equal(
    passesSourceSpecificRelevanceGuard(
      makeCandidate(
        "The Register",
        "Ransomware breach disrupts major cloud platform",
        "The incident affected enterprise customers across the market and forced a broad infrastructure response."
      )
    ),
    true
  );
});

test("The New Stack tutorial noise is rejected", () => {
  assert.equal(
    passesSourceSpecificRelevanceGuard(
      makeCandidate(
        "The New Stack",
        "How to configure tracing for a Kubernetes service",
        "This tutorial walks developers through configuration and installation commands."
      )
    ),
    false
  );
});

test("The New Stack meaningful platform shift is accepted", () => {
  assert.equal(
    passesSourceSpecificRelevanceGuard(
      makeCandidate(
        "The New Stack",
        "Cloud platform acquisition reshapes the enterprise software market",
        "The acquisition changes infrastructure strategy for major enterprise teams."
      )
    ),
    true
  );
});

test("404 Media surveillance technology without an explicit privacy label is accepted", () => {
  assert.equal(
    passesSourceSpecificRelevanceGuard(
      makeCandidate(
        "404 Media",
        "Cops are asking Axon to make their cameras look different from Flock",
        "Police departments are responding to public scrutiny of networked camera systems."
      )
    ),
    true
  );
});

test("The New Stack meaningful agent-development change is accepted", () => {
  assert.equal(
    passesSourceSpecificRelevanceGuard(
      makeCandidate(
        "The New Stack",
        "Vercel built a feedback loop that treats agent instructions like software",
        "The developer platform changed how teams test and manage production agent behavior."
      )
    ),
    true
  );
});
