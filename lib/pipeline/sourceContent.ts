import he from "he";

import { normalizeExternalText } from "@/lib/pipeline/cleanText";
import type { NormalizedStory } from "@/types/story";

const SOURCE_FETCH_TIMEOUT_MS = 10_000;
const MAX_SOURCE_TEXT_LENGTH = 12_000;
const MIN_USEFUL_SOURCE_TEXT_LENGTH = 500;

function stripNonContent(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");
}

function extractJsonLdArticleBody(html: string) {
  const matches = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const candidates = node?.["@graph"] && Array.isArray(node["@graph"]) ? node["@graph"] : [node];
        for (const candidate of candidates) {
          if (typeof candidate?.articleBody === "string") return candidate.articleBody;
        }
      }
    } catch {}
  }
  return "";
}

function extractPrimaryHtml(html: string) {
  return html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || html;
}

export function extractReadableSourceText(html: string) {
  const jsonLdBody = extractJsonLdArticleBody(html);
  const candidate = jsonLdBody || extractPrimaryHtml(stripNonContent(html));
  const withBreaks = candidate
    .replace(/<\/(?:p|div|section|article|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");

  return normalizeExternalText(he.decode(withBreaks), { stripHtml: true })
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, MAX_SOURCE_TEXT_LENGTH);
}

export async function hydrateStorySource(story: NormalizedStory): Promise<NormalizedStory> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(story.url, {
      headers: {
        "user-agent": "SignalBrief/1.0",
        accept: "text/html,application/xhtml+xml"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) return { ...story, source_fetch_status: `http-${response.status}` };

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return { ...story, source_fetch_status: "unsupported-content-type" };
    }

    const sourceText = extractReadableSourceText(await response.text());
    if (sourceText.length < MIN_USEFUL_SOURCE_TEXT_LENGTH) {
      return { ...story, source_fetch_status: "insufficient-source-text" };
    }
    return { ...story, source_text: sourceText, source_fetch_status: "full-source" };
  } catch (error) {
    const status = error instanceof Error && error.name === "AbortError" ? "timeout" : "fetch-failed";
    return { ...story, source_fetch_status: status };
  } finally {
    clearTimeout(timeout);
  }
}

export function hasEnoughEvidence(story: NormalizedStory) {
  return Boolean(story.source_text?.trim()) || story.raw_snippet.trim().length >= 350;
}
