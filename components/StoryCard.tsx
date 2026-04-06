import type { Story } from "@/types/story";
import { cn, formatRelativeTime } from "@/lib/utils";

type StoryCardProps = {
  story: Story;
  compact?: boolean;
};

export function StoryCard({ story, compact = false }: StoryCardProps) {
  const publishTimeLabel = formatRelativeTime(story.published_at);

  if (compact) {
    return (
      <article className={cn("story-card", "story-card-compact")}>
        <div className="story-compact-main">
          <h2 className="story-headline story-headline-compact">
            <a className="story-link" href={story.url} target="_blank" rel="noreferrer">
              {story.title}
            </a>
          </h2>
          <div className="story-meta">
            <span>{story.source}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={story.published_at}>{publishTimeLabel}</time>
          </div>
        </div>

        <div className="story-pill">
          <span>{story.tag}</span>
          <span aria-hidden="true">·</span>
          <span>{story.score}</span>
        </div>
      </article>
    );
  }

  return (
    <article className={cn("story-card")}>
      <div className="story-topline">
        <div className="story-meta">
          <span>{story.source}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={story.published_at}>{publishTimeLabel}</time>
        </div>

        <div className="story-pill">
          <span>{story.tag}</span>
          <span aria-hidden="true">·</span>
          <span>{story.score}</span>
        </div>
      </div>

      <div className="story-body">
        <h2 className="story-headline">
          <a className="story-link" href={story.url} target="_blank" rel="noreferrer">
            {story.title}
          </a>
        </h2>

        <div className="story-why">
          <p className="story-why-label">Why this matters →</p>
          <p className="story-why-copy">{story.why_it_matters}</p>
        </div>
        <p className="story-summary">{story.summary}</p>
      </div>
    </article>
  );
}
