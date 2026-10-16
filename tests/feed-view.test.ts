import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { Feed } from "@/components/Feed";
import { FEED_TOPICS, readFeedTopic, withFeedTopic } from "@/lib/feed-topic";
import { readFeedView, withFeedView } from "@/lib/feed-view";
import type { Story } from "@/types/story";

const fixture: Story = {
  id: "lead", title: "Editorial lead", url: "https://example.com/lead", source: "Fixture",
  source_type: "reporting", published_at: "2026-10-14T00:00:00Z", summary: "Context.",
  why_it_matters: "An important development.", tag: "AI", score: 95,
  created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z", article_access: "open"
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

test("reading modes round trip and unknown values safely default to List", () => {
  for (const view of ["list", "compact"] as const) {
    const url = new URL(withFeedView("https://www.signalbrief.xyz/", view), "https://www.signalbrief.xyz");
    assert.equal(readFeedView(url.searchParams.get("view")), view);
  }
  for (const value of [null, "", "list", "Compact", "unknown", "<script>"]) {
    assert.equal(readFeedView(value), "list");
  }
});

test("view changes preserve topic, pathname, attribution, other values, and hash", () => {
  for (const view of ["list", "compact"] as const) {
    const url = new URL(withFeedView("https://www.signalbrief.xyz/?topic=Consumer+Tech&view=compact&utm_source=reader&other=a%26b#briefing-title", view), "https://www.signalbrief.xyz");
    assert.equal(readFeedView(url.searchParams.get("view")), view);
    assert.equal(url.searchParams.get("topic"), "Consumer Tech");
    assert.equal(url.pathname, "/");
    assert.equal(url.searchParams.get("utm_source"), "reader");
    assert.equal(url.searchParams.get("other"), "a&b");
    assert.equal(url.hash, "#briefing-title");
  }
});

test("every topic switch, including All, preserves the current Compact mode", () => {
  for (const topic of FEED_TOPICS) {
    const url = new URL(withFeedTopic("https://www.signalbrief.xyz/?view=compact&topic=Product", topic), "https://www.signalbrief.xyz");
    assert.equal(readFeedView(url.searchParams.get("view")), "compact");
    assert.equal(readFeedTopic(url.searchParams.get("topic")), topic);
  }
});

test("repeated mode selections are stable and List removes only the view parameter", () => {
  assert.equal(withFeedView("https://www.signalbrief.xyz/?view=compact", "compact"), "/?view=compact");
  assert.equal(withFeedView("https://www.signalbrief.xyz/?view=list&view=compact", "compact"), "/?view=compact");
  assert.equal(withFeedView("https://www.signalbrief.xyz/?view=compact&topic=Media#top", "list"), "/?topic=Media#top");
  assert.equal(withFeedView("https://www.signalbrief.xyz/?view=compact", "list"), "/");
});

test("a fresh Compact visit restores both reading mode and topic from its URL", () => {
  const html = renderVisit("topic=Product&view=compact");
  assert.match(html, /aria-pressed="true">Compact<\/button>/);
  assert.match(html, /aria-pressed="true">Product<\/button>/);
  assert.match(html, /Briefing index · Product/);
  assert.match(html, /class="compact-story"/);
  assert.ok(html.includes("Product fixture"));
  assert.ok(!html.includes("Media fixture"));
  assert.ok(html.includes("Editorial lead"));
  assert.ok(!html.includes("Worth knowing"));
});

test("return mounts restore each visit's mode without borrowing another visit's selection", () => {
  for (const [query, view, topic] of [
    ["topic=Product&view=compact", "Compact", "Product"],
    ["topic=Media", "List", "Media"],
    ["topic=Product&view=compact", "Compact", "Product"],
    ["view=compact", "Compact", "All"],
    ["", "List", "All"]
  ]) {
    const html = renderVisit(query);
    assert.match(html, new RegExp(`aria-pressed="true">${view}</button>`));
    assert.match(html, new RegExp(`aria-pressed="true">${topic}</button>`));
  }
});

test("missing, empty, and unrecognized reading modes retain the default List view", () => {
  for (const query of ["", "view=", "view=list", "view=Compact", "view=unknown"]) {
    const html = renderVisit(query);
    assert.match(html, /aria-pressed="true">List<\/button>/);
    assert.ok(!html.includes("class=\"compact-story\""));
  }
});

for (const view of ["list", "compact"] as const) {
  test(`${view}: empty topic keeps exactly one Daily Signal signup anchor`, () => {
    const html = renderVisit(`topic=Strategy&view=${view}`);
    assert.match(html, /No Strategy stories are live right now/);
    assert.equal((html.match(/id="daily-signal"/g) ?? []).length, 1);
    assert.match(html, /type="email"/);
    assert.match(html, new RegExp(`aria-pressed="true">${view === "compact" ? "Compact" : "List"}</button>`));
  });

  test(`${view}: populated → empty → All → empty → populated retains signup and URL state`, () => {
    let href = `https://www.signalbrief.xyz/?utm_source=regression&view=${view}#daily-signal`;
    for (const topic of ["Product", "Strategy", "All", "Strategy", "Media"] as const) {
      href = new URL(withFeedTopic(href, topic), "https://www.signalbrief.xyz").href;
      const url = new URL(href);
      const html = renderVisit(url.search);
      assert.equal(url.searchParams.get("utm_source"), "regression");
      assert.equal(url.hash, "#daily-signal");
      assert.equal(readFeedView(url.searchParams.get("view")), view);
      assert.equal(readFeedTopic(url.searchParams.get("topic")), topic);
      assert.match(html, new RegExp(`aria-pressed="true">${topic}</button>`));
      assert.match(html, new RegExp(`aria-pressed="true">${view === "compact" ? "Compact" : "List"}</button>`));
      assert.equal((html.match(/id="daily-signal"/g) ?? []).length, 1);
      assert.ok(html.includes("Editorial lead"));
      assert.equal(html.includes("No Strategy stories are live right now"), topic === "Strategy");
      if (topic === "Product" || topic === "Media") assert.ok(html.includes(`${topic} fixture`));
      if (topic === "All") {
        assert.ok(html.includes("Product fixture"));
        assert.ok(html.includes("Media fixture"));
      }
    }
  });
}
