import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { Feed } from "@/components/Feed";
import { FEED_TOPICS, readFeedTopic, withFeedTopic } from "@/lib/feed-topic";
import type { Story } from "@/types/story";

test("every topic survives URL serialization, including Consumer Tech", () => {
  for (const topic of FEED_TOPICS) {
    const href = withFeedTopic("https://www.signalbrief.xyz/", topic);
    assert.equal(readFeedTopic(new URL(href, "https://www.signalbrief.xyz").searchParams.get("topic")), topic);
  }
});

test("absent, empty, and unknown topic values safely use All", () => {
  for (const value of [null, "", "product", "Unknown", "<script>"]) {
    assert.equal(readFeedTopic(value), "All");
  }
});

test("switching topics preserves attribution, other query values, pathname, and hash", () => {
  const href = withFeedTopic("https://www.signalbrief.xyz/?utm_source=reader&topic=AI&other=a%26b#briefing-title", "Media");
  const url = new URL(href, "https://www.signalbrief.xyz");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("topic"), "Media");
  assert.equal(url.searchParams.get("utm_source"), "reader");
  assert.equal(url.searchParams.get("other"), "a&b");
  assert.equal(url.hash, "#briefing-title");
});

test("All removes only the filter and repeated selections stay stable", () => {
  assert.equal(withFeedTopic("https://www.signalbrief.xyz/?topic=Product", "All"), "/");
  assert.equal(withFeedTopic("https://www.signalbrief.xyz/?topic=Product&utm_source=reader#top", "All"), "/?utm_source=reader#top");
  assert.equal(withFeedTopic("https://www.signalbrief.xyz/?topic=Product&topic=Media", "Product"), "/?topic=Product");
  assert.equal(withFeedTopic("https://www.signalbrief.xyz/?topic=Product", "Product"), "/?topic=Product");
});

const fixture: Story = {
  id: "lead", title: "Editorial lead", url: "https://example.com/lead", source: "Fixture",
  source_type: "reporting", published_at: "2026-10-11T00:00:00Z", summary: "Context.",
  why_it_matters: "An important development.", tag: "AI", score: 95,
  created_at: "2026-10-11T00:00:00Z", updated_at: "2026-10-11T00:00:00Z", article_access: "open"
};
const stories: Story[] = [fixture,
  { ...fixture, id: "product", title: "Product fixture", tag: "Product", score: 90 },
  { ...fixture, id: "media", title: "Media fixture", tag: "Media", score: 85 }
];

function renderVisit(query: string) {
  return renderToStaticMarkup(createElement(SearchParamsContext.Provider,
    { value: new URLSearchParams(query) },
    createElement(Feed, { stories, lastRefreshedAt: null })
  ));
}

test("a fresh feed mount derives the selected button and stories from the history URL", () => {
  for (const topic of ["Product", "Media"]) {
    const html = renderVisit(`topic=${topic}`);
    assert.match(html, new RegExp(`aria-pressed="true">${topic}</button>`));
    assert.ok(html.includes(`${topic} fixture`));
    assert.ok(!html.includes(`${topic === "Product" ? "Media" : "Product"} fixture`));
    assert.ok(html.includes("Editorial lead"));
  }
});

test("return visits restore their own URL instead of another visit's selection", () => {
  for (const query of ["topic=Product", "topic=Media", "topic=Product", "topic=Media"]) {
    const expected = new URLSearchParams(query).get("topic");
    assert.match(renderVisit(query), new RegExp(`aria-pressed="true">${expected}</button>`));
  }
  assert.match(renderVisit("topic=unknown"), /aria-pressed="true">All<\/button>/);
  assert.match(renderVisit(""), /aria-pressed="true">All<\/button>/);
});
