import type { Story } from "@/types/story";
import { formatRelativeTime } from "@/lib/utils";

type StoryCardProps = {
  story: Story;
  variant: "lead" | "worth" | "latest" | "compact";
  index?: number;
};

function StoryMeta({ story, showScore = false }: { story: Story; showScore?: boolean }) {
  const publishTimeLabel = formatRelativeTime(story.published_at);

  return (
    <p className="story-meta">
      <span className="story-source">{story.source}</span>
      <span aria-hidden="true">/</span>
      <time dateTime={story.published_at}>{publishTimeLabel}</time>
      <span aria-hidden="true">/</span>
      <span>{story.tag}</span>
      {showScore ? <span className="story-score">{story.score}</span> : null}
    </p>
  );
}

export function StoryCard({ story, variant, index }: StoryCardProps) {
  const linkLabel = `${story.title} — ${story.source} (opens in a new tab)`;

  if (variant === "compact") {
    return (
      <article className="compact-story">
        <span className="compact-index" aria-hidden="true">
          {String(index ?? 1).padStart(2, "0")}
        </span>
        <div className="compact-story-body">
          <StoryMeta story={story} />
          <h3 className="compact-headline">
            <a className="story-link" href={story.url} target="_blank" rel="noopener noreferrer" aria-label={linkLabel}>
              {story.title}
            </a>
          </h3>
          <p className="compact-summary compact-signal"><span>The Signal:</span> {story.why_it_matters}</p>
        </div>
      </article>
    );
  }

  if (variant === "latest") {
    return (
      <article className="latest-story">
        <StoryMeta story={story} />
        <div className="latest-story-copy">
          <h3 className="latest-headline">
            <a className="story-link" href={story.url} target="_blank" rel="noopener noreferrer" aria-label={linkLabel}>
              {story.title}
            </a>
          </h3>
          <p className="story-summary">{story.summary}</p>
        </div>
        <p className="story-why latest-why">
          <span>The Signal:</span> {story.why_it_matters}
        </p>
      </article>
    );
  }

  return (
    <article className={variant === "lead" ? "lead-story" : "worth-story"}>
      <StoryMeta story={story} />
      <div className="story-body">
        <h3 className={variant === "lead" ? "lead-headline" : "worth-headline"}>
          <a className="story-link" href={story.url} target="_blank" rel="noopener noreferrer" aria-label={linkLabel}>
            {story.title}
          </a>
        </h3>

        <p className="story-summary">{story.summary}</p>

        <p className="story-why">
          <span>The Signal:</span> {story.why_it_matters}
        </p>

      </div>
    </article>
  );
}
