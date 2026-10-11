import type { PublicStoryTopic } from "@/types/story";

export const FEED_TOPICS: PublicStoryTopic[] = [
  "All", "AI", "Media", "Strategy", "Product", "Business", "Consumer Tech"
];

export function readFeedTopic(value: string | null): PublicStoryTopic {
  return FEED_TOPICS.find((topic) => topic === value) ?? "All";
}

export function withFeedTopic(href: string, topic: PublicStoryTopic): string {
  const url = new URL(href);
  if (topic === "All") url.searchParams.delete("topic");
  else url.searchParams.set("topic", topic);
  return `${url.pathname}${url.search}${url.hash}`;
}
