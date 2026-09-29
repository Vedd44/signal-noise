"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StoryCard } from "@/components/StoryCard";
import { DailySignalSignup } from "@/components/DailySignalSignup";
import { ThemeControl } from "@/components/ThemeControl";
import { organizeBriefingStories } from "@/lib/briefing";
import type { PublicStoryTopic, Story } from "@/types/story";
import { formatRelativeTime } from "@/lib/utils";

export { organizeBriefingStories } from "@/lib/briefing";

type FeedView = "list" | "compact";

const TOPICS: PublicStoryTopic[] = [
  "All",
  "AI",
  "Media",
  "Strategy",
  "Product",
  "Business",
  "Consumer Tech"
];

type FeedProps = {
  stories: Story[];
  lastRefreshedAt: string | null;
};

export function Feed({ stories, lastRefreshedAt }: FeedProps) {
  const [view, setView] = useState<FeedView>("list");
  const [topic, setTopic] = useState<PublicStoryTopic>("All");
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const scrollIntervalRef = useRef<number | null>(null);

  const stopAutoScroll = useCallback(() => {
    if (scrollIntervalRef.current !== null) {
      window.clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    setIsAutoScrolling(false);
  }, []);

  const startAutoScroll = useCallback(() => {
    if (scrollIntervalRef.current !== null || prefersReducedMotion) {
      return;
    }

    setIsAutoScrolling(true);
    scrollIntervalRef.current = window.setInterval(() => {
      const scrollPosition = window.scrollY + window.innerHeight;
      const pageHeight = document.documentElement.scrollHeight;

      if (Math.ceil(scrollPosition) >= pageHeight - 1) {
        stopAutoScroll();
        return;
      }

      window.scrollBy({ top: 1, behavior: "auto" });
    }, 25);
  }, [prefersReducedMotion, stopAutoScroll]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);

    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const updateBackToTopVisibility = () => {
      setShowBackToTop(window.scrollY > Math.max(600, window.innerHeight * 0.75));
    };

    updateBackToTopVisibility();
    window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });

    return () => window.removeEventListener("scroll", updateBackToTopVisibility);
  }, []);

  useEffect(() => {
    if (!isAutoScrolling) {
      return;
    }

    const handleManualScrollIntent = () => {
      stopAutoScroll();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        stopAutoScroll();
      }
    };

    window.addEventListener("wheel", handleManualScrollIntent, { passive: true });
    window.addEventListener("touchstart", handleManualScrollIntent, { passive: true });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("wheel", handleManualScrollIntent);
      window.removeEventListener("touchstart", handleManualScrollIntent);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAutoScrolling, stopAutoScroll]);

  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current !== null) {
        window.clearInterval(scrollIntervalRef.current);
      }
    };
  }, []);

  const { leadStory, filteredBriefingStories, worthKnowingStories, latestStories } = useMemo(
    () => organizeBriefingStories(stories, topic),
    [stories, topic]
  );

  const latestPublishedAt = useMemo(() => {
    return stories.reduce<string | null>((latest, story) => {
      if (!latest) {
        return story.published_at;
      }

      return Date.parse(story.published_at) > Date.parse(latest)
        ? story.published_at
        : latest;
    }, null);
  }, [stories]);

  const lastUpdated = lastRefreshedAt
    ? formatRelativeTime(lastRefreshedAt)
    : latestPublishedAt
    ? formatRelativeTime(latestPublishedAt)
    : "just now";

  const sectionSuffix = topic === "All" ? "" : ` · ${topic}`;

  const scrollBackToTop = () => {
    stopAutoScroll();
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });
  };

  return (
    <section className="briefing" aria-labelledby="briefing-title">
      <div className="briefing-bar">
        <div className="briefing-heading">
          <h2 id="briefing-title" className="section-label briefing-title">
            Today&apos;s briefing
          </h2>
          <p className="briefing-updated">
            {stories.length} stories · Updated {lastUpdated}
          </p>
        </div>

        <div className="briefing-actions">
          <button
            type="button"
            className={isAutoScrolling ? "auto-scroll-toggle is-active" : "auto-scroll-toggle"}
            aria-pressed={isAutoScrolling}
            onClick={isAutoScrolling ? stopAutoScroll : startAutoScroll}
            disabled={prefersReducedMotion}
            title={prefersReducedMotion ? "Disabled by your reduced-motion preference" : undefined}
          >
            {isAutoScrolling ? "Auto-scroll on" : "Auto-scroll"}
          </button>

          <div className="view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={view === "list" ? "view-toggle-button is-active" : "view-toggle-button"}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              List
            </button>
            <button
              type="button"
              className={view === "compact" ? "view-toggle-button is-active" : "view-toggle-button"}
              aria-pressed={view === "compact"}
              onClick={() => setView("compact")}
            >
              Compact
            </button>
          </div>

          <ThemeControl />
        </div>
      </div>

      {!leadStory ? (
        <>
          <div className="feed-empty-state">
            <p className="feed-empty-title">No stories are live right now.</p>
            <p className="feed-empty-copy">
              The next briefing is on its way. Check back shortly for fresh signal.
            </p>
          </div>
          <DailySignalSignup />
        </>
      ) : (
        <div className="editorial-feed">
          <section className="lead-section" aria-labelledby="lead-title">
            <h2 id="lead-title" className="feed-section-label">The lead</h2>
            <StoryCard story={leadStory} variant="lead" />
          </section>

          <div className="filtered-briefing">
            <fieldset className="topic-filter">
              <legend className="sr-only">Filter stories by topic</legend>
              <div className="topic-filter-track">
                {TOPICS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={topic === item ? "topic-filter-button is-active" : "topic-filter-button"}
                    aria-pressed={topic === item}
                    onClick={() => setTopic(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>

            {filteredBriefingStories.length === 0 ? (
              <div className="feed-empty-state filtered-empty-state">
                <p className="feed-empty-title">No {topic} stories are live right now.</p>
                <p className="feed-empty-copy">Choose another category or return to All.</p>
              </div>
            ) : view === "compact" ? (
              <>
                <section className="compact-section" aria-labelledby="compact-title">
                  <div className="feed-section-heading compact-section-heading">
                    <h2 id="compact-title">Briefing index{sectionSuffix}</h2>
                  </div>
                  <div className="compact-list">
                    {filteredBriefingStories.map((story, index) => (
                      <StoryCard key={story.id} story={story} variant="compact" index={index + 1} />
                    ))}
                  </div>
                </section>
                <DailySignalSignup />
              </>
            ) : (
              <>
                {worthKnowingStories.length > 0 ? (
                  <section className="worth-section" aria-labelledby="worth-title">
                    <div className="feed-section-heading">
                      <h2 id="worth-title">Worth knowing{sectionSuffix}</h2>
                    </div>
                    <div className="worth-grid">
                      {worthKnowingStories.map((story) => (
                        <StoryCard key={story.id} story={story} variant="worth" />
                      ))}
                    </div>
                  </section>
                ) : null}

                <DailySignalSignup />

                {latestStories.length > 0 ? (
                  <section className="latest-section" aria-labelledby="latest-title">
                    <div className="feed-section-heading">
                      <h2 id="latest-title">The latest{sectionSuffix}</h2>
                    </div>
                    <div className="latest-column-headings">
                      <span>Source</span>
                      <span>Story</span>
                      <span>The Signal ›</span>
                    </div>
                    <div className="latest-list">
                      {latestStories.map((story) => (
                        <StoryCard key={story.id} story={story} variant="latest" />
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      {isAutoScrolling ? (
        <button
          type="button"
          className="auto-scroll-stop"
          onClick={stopAutoScroll}
          aria-label="Stop auto-scroll"
        >
          Stop auto-scroll
        </button>
      ) : null}

      {showBackToTop ? (
        <button type="button" className="back-to-top" onClick={scrollBackToTop} aria-label="Back to top">
          <span aria-hidden="true">↑</span> Top
        </button>
      ) : null}
    </section>
  );
}
