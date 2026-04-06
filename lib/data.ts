import { getSupabaseReadClient } from "@/lib/db";
import { isValidStoryTag } from "@/lib/scoring";
import type { Story } from "@/types/story";

function isValidStory(value: unknown): value is Story {
  if (!value || typeof value !== "object") {
    return false;
  }

  const story = value as Record<string, unknown>;

  return (
    typeof story.id === "string" &&
    typeof story.title === "string" &&
    typeof story.url === "string" &&
    typeof story.source === "string" &&
    (story.source_type === "primary" ||
      story.source_type === "reporting" ||
      story.source_type === "analysis") &&
    typeof story.published_at === "string" &&
    !Number.isNaN(Date.parse(story.published_at)) &&
    typeof story.summary === "string" &&
    typeof story.why_it_matters === "string" &&
    typeof story.tag === "string" &&
    isValidStoryTag(story.tag) &&
    typeof story.score === "number" &&
    typeof story.created_at === "string"
  );
}

export async function getPublishedStories() {
  try {
    const supabase = getSupabaseReadClient();
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, title, url, source, source_type, published_at, summary, why_it_matters, tag, score, raw_snippet, image_url, read_time, is_top_signal, status, created_at"
      )
      .eq("status", "published")
      .order("score", { ascending: false })
      .order("published_at", { ascending: false });

    if (error || !Array.isArray(data)) {
      return [];
    }

    return data.filter(isValidStory);
  } catch {
    return [];
  }
}
