export type StorySourceType = "primary" | "reporting" | "analysis";

export type StoryTag =
  | "AI"
  | "Product"
  | "Media"
  | "Strategy"
  | "Business"
  | "Consumer Tech";

export type PublicStoryTopic =
  | "All"
  | "AI"
  | "Media"
  | "Strategy"
  | "Product"
  | "Business"
  | "Consumer Tech";

export type Story = {
  id: string;
  title: string;
  url: string;
  source: string;
  source_type: StorySourceType;
  published_at: string;
  summary: string;
  why_it_matters: string;
  tag: StoryTag;
  score: number;
  raw_snippet?: string;
  created_at: string;
  updated_at: string;
  is_top_signal?: boolean;
  status?: string;
  image_url?: string;
  read_time?: number;
  article_access?: "open" | "subscription" | "registration" | "unknown";
};

export type NormalizedStory = {
  id: string;
  title: string;
  url: string;
  source: string;
  source_type: StorySourceType;
  published_at: string;
  raw_snippet: string;
  feed_language?: string;
  item_language?: string;
  source_text?: string;
  source_fetch_status?: string;
  article_access?: "open" | "subscription" | "registration" | "unknown";
  created_at: string;
};

export type StoryEnrichment = Pick<
  Story,
  "summary" | "why_it_matters" | "tag" | "score"
>;
