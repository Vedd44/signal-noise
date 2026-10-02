import { publicHttpUrl } from "@/lib/urls";
import { dedupeStories } from "@/lib/dedupe";
import { getSupabaseReadClient } from "@/lib/db";
import { normalizeExternalText } from "@/lib/pipeline/cleanText";
import { evaluateStoryEditorialFit, normalizeStoryTag } from "@/lib/scoring";
import { orderStoriesForFeed } from "@/lib/utils";
import type { Story } from "@/types/story";

export function normalizeStory(value: unknown): Story | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const story = value as Record<string, unknown>;
  const normalizedTag =
    typeof story.tag === "string" ? normalizeStoryTag(story.tag) : null;

  if (
    typeof story.id === "string" &&
    typeof story.title === "string" && story.title.trim().length > 0 &&
    typeof story.url === "string" && publicHttpUrl(story.url) !== null &&
    typeof story.source === "string" &&
    (story.source_type === "primary" ||
      story.source_type === "reporting" ||
      story.source_type === "analysis") &&
    typeof story.published_at === "string" &&
    !Number.isNaN(Date.parse(story.published_at)) &&
    typeof story.summary === "string" && story.summary.trim().length > 0 &&
    typeof story.why_it_matters === "string" && story.why_it_matters.trim().length > 0 &&
    normalizedTag &&
    typeof story.score === "number" && Number.isFinite(story.score) &&
    typeof story.created_at === "string" &&
    typeof story.updated_at === "string"
  ) {
      return {
        id: story.id,
        title: normalizeExternalText(story.title, { stripHtml: true }),
        url: story.url,
        source: normalizeExternalText(story.source, { stripHtml: true }),
        source_type: story.source_type,
        published_at: story.published_at,
        summary: normalizeExternalText(story.summary, { stripHtml: true }),
        why_it_matters: normalizeExternalText(story.why_it_matters, { stripHtml: true }),
        tag: normalizedTag,
        score: story.score,
        raw_snippet:
          typeof story.raw_snippet === "string"
            ? normalizeExternalText(story.raw_snippet, { stripHtml: true })
            : undefined,
        image_url: typeof story.image_url === "string" ? story.image_url : undefined,
        read_time: typeof story.read_time === "number" ? story.read_time : undefined,
        is_top_signal:
          typeof story.is_top_signal === "boolean" ? story.is_top_signal : undefined,
        status: typeof story.status === "string" ? story.status : undefined,
        created_at: story.created_at,
        updated_at: story.updated_at
      };
    }

  return null;
}

export async function getPublishedStories(): Promise<{
  stories: Story[];
  lastRefreshedAt: string | null;
}>;
export async function getPublishedStories(options: { throwOnError: true }): Promise<{
  stories: Story[];
  lastRefreshedAt: string | null;
}>;
export async function getPublishedStories(options?: { throwOnError?: boolean }): Promise<{
  stories: Story[];
  lastRefreshedAt: string | null;
}> {
  try {
    const supabase = getSupabaseReadClient();
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, title, url, source, source_type, published_at, summary, why_it_matters, tag, score, raw_snippet, image_url, read_time, is_top_signal, status, created_at, updated_at"
      )
      .eq("status", "published")
      .gte("published_at", new Date(Date.now()-72*3600_000).toISOString())
      .lte("published_at", new Date(Date.now()+5*60_000).toISOString())
      .order("published_at", { ascending: false });

    if (error) {
      console.error("[stories] query failed", error.message);
      if (options?.throwOnError) throw error;
      return {
        stories: [],
        lastRefreshedAt: null
      };
    }

    if (!Array.isArray(data)) {
      console.warn("[stories] query returned no array data");
      if (options?.throwOnError) throw new Error("Story query returned invalid data");
      return {
        stories: [],
        lastRefreshedAt: null
      };
    }

    const stories = data
      .map((story) => normalizeStory(story))
      .filter((story): story is Story => story !== null)
      .filter((story) => evaluateStoryEditorialFit(story).keep);
    console.log(
      `[stories] fetched ${data.length} published rows, ${stories.length} passed validation`
    );

    if (stories.length !== data.length) {
      const invalidRows = data.filter((story) => normalizeStory(story) === null);
      console.warn(
        `[stories] filtered out ${invalidRows.length} invalid rows`,
        invalidRows.slice(0, 3).map((story) => {
          const row = story as Record<string, unknown>;
          return {
            id: row.id,
            tag: row.tag,
            status: row.status,
            published_at: row.published_at
          };
        })
      );
    }

    const lastRefreshedAt = stories.reduce<string | null>((latest, story) => {
      if (!latest) {
        return story.updated_at;
      }

      return Date.parse(story.updated_at) > Date.parse(latest) ? story.updated_at : latest;
    }, null);

    return {
      stories: dedupeStories(orderStoriesForFeed(stories)),
      lastRefreshedAt
    };
  } catch (error) {
    if (options?.throwOnError) throw error;
    console.error(
      "[stories] unexpected read failure",
      error instanceof Error ? error.message : "Unknown error"
    );
    return {
      stories: [],
      lastRefreshedAt: null
    };
  }
}
