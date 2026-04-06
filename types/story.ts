export type StorySourceType = "primary" | "reporting" | "analysis";

export type StoryTag =
  | "Platform Move"
  | "Narrative Shift"
  | "Product Signal"
  | "Business Move"
  | "Media Signal"
  | "Audience Trend"
  | "PR Signal";

export type Story = {
  // Stable identifier for the story across ingest, storage, and rendering.
  id: string;
  // Human-readable headline shown throughout the product.
  title: string;
  // Canonical outbound URL for the original story.
  url: string;
  // Publication, outlet, or source name.
  source: string;
  // Editorial classification for the source itself.
  source_type: StorySourceType;
  // Original publish timestamp in ISO 8601 format.
  published_at: string;
  // Concise editorial summary used in list view.
  summary: string;
  // Strongest framing line explaining the story's importance.
  why_it_matters: string;
  // Curated editorial tag for story grouping and filtering.
  tag: StoryTag;
  // Priority score from 1-100 for ranking signal strength.
  score: number;
  // Optional raw excerpt captured during ingest before editing.
  raw_snippet?: string;
  // Timestamp for when the story record was created in Signal > Noise.
  created_at: string;
  // Optional flag for standout stories that deserve extra emphasis later.
  is_top_signal?: boolean;
  // Publishing status for storage and workflow control.
  status?: string;
  // Optional image URL reserved for future presentation needs.
  image_url?: string;
  // Optional estimated reading time in minutes.
  read_time?: number;
};

export type NormalizedStory = {
  // Stable identifier derived locally from source, URL, and title.
  id: string;
  // Headline pulled directly from the feed item.
  title: string;
  // Canonical URL for the feed entry.
  url: string;
  // Human-readable source name from the configured feed.
  source: string;
  // Editorial source classification from the configured feed.
  source_type: StorySourceType;
  // Feed publish timestamp in ISO 8601 format.
  published_at: string;
  // Raw excerpt from the feed before editorial enrichment.
  raw_snippet: string;
  // Timestamp for when Signal > Noise normalized the item locally.
  created_at: string;
};

export type StoryEnrichment = Pick<
  Story,
  "summary" | "why_it_matters" | "tag" | "score"
>;
