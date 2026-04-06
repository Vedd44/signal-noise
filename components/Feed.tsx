"use client";

import { useMemo, useState } from "react";

import { StoryCard } from "@/components/StoryCard";
import type { Story, StoryTag } from "@/types/story";
import { formatRelativeTime } from "@/lib/utils";

type FeedView = "list" | "compact";
type FeedTopic = "All" | StoryTag;

const TOPICS: FeedTopic[] = [
  "All",
  "Platform Move",
  "Narrative Shift",
  "Product Signal",
  "Business Move",
  "Media Signal",
  "Audience Trend",
  "PR Signal"
];

type FeedProps = {
  stories: Story[];
};

export function Feed({ stories }: FeedProps) {
  const [view, setView] = useState<FeedView>("list");
  const [topic, setTopic] = useState<FeedTopic>("All");

  const filteredStories = useMemo(() => {
    if (topic === "All") {
      return stories;
    }

    return stories.filter((story) => story.tag === topic);
  }, [stories, topic]);

  const lastUpdated = stories[0]?.published_at
    ? formatRelativeTime(stories[0].published_at)
    : "just now";

  return (
    <section aria-labelledby="latest-stories">
      <div className="briefing-bar">
        <div className="briefing-heading">
          <p id="latest-stories" className="section-label">
            Today&apos;s signal
          </p>
          <p className="briefing-updated">
            {filteredStories.length} stories · Updated {lastUpdated}
          </p>
        </div>

        <div className="view-toggle" aria-label="View mode">
          <button
            type="button"
            className={view === "list" ? "view-toggle-button is-active" : "view-toggle-button"}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            type="button"
            className={view === "compact" ? "view-toggle-button is-active" : "view-toggle-button"}
            onClick={() => setView("compact")}
          >
            Compact
          </button>
        </div>
      </div>

      <div className="topic-filter" aria-label="Topic filter">
        {TOPICS.map((item) => (
          <button
            key={item}
            type="button"
            className={topic === item ? "topic-filter-button is-active" : "topic-filter-button"}
            onClick={() => setTopic(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {filteredStories.length === 0 ? (
        <div className="feed-empty-state">
          <p className="feed-empty-title">No enriched stories available yet.</p>
          <p className="feed-empty-copy">
            Run the local ingestion and enrichment pipeline to populate the feed.
          </p>
        </div>
      ) : (
        <div className={view === "compact" ? "story-grid is-compact" : "story-grid"}>
          {filteredStories.map((story) => (
            <StoryCard key={story.id} story={story} compact={view === "compact"} />
          ))}
        </div>
      )}
    </section>
  );
}
