import { detectArticleAccess } from "@/lib/article-access";
import he from "he";

import { normalizeExternalText } from "@/lib/pipeline/cleanText";
import type { NormalizedStory } from "@/types/story";
import { rssSources } from "@/lib/feeds";
import { publicHttpUrl } from "@/lib/urls";

const SOURCE_FETCH_TIMEOUT_MS = 10_000;
const MAX_SOURCE_TEXT_LENGTH = 12_000;
const MIN_USEFUL_SOURCE_TEXT_LENGTH = 500;

function stripNonContent(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(nav|header|footer|aside|form|select)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
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
    } catch { /* Publishers sometimes emit malformed JSON-LD; use their article element instead. */ }
  }
  return "";
}

function extractPrimaryHtml(html: string) {
  const body = html.match(/<div\b[^>]*(?:id|class)=["'][^"']*\b(?:tns-post-body-content|entry-content|article-body|post-content)\b[^"']*["'][^>]*>/i);
  if (body?.index !== undefined) {
    const start = body.index + body[0].length;
    const tags = /<\/?div\b[^>]*>/gi;
    tags.lastIndex = start;
    let depth = 1;
    for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (depth === 0) return html.slice(start, tag.index);
    }
  }
  return html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || ""; // Navigation and subscription forms are not article evidence.
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

export async function hydrateStorySource(story: NormalizedStory, timeoutMs = SOURCE_FETCH_TIMEOUT_MS): Promise<NormalizedStory> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const publisher = rssSources.find(source => source.name === story.source);
    const host = publisher ? new URL(publisher.rss_url).hostname.replace(/^www\./, '') : '';
    const parts = host.split('.');
    const base = parts.slice(host.endsWith('.co.uk') ? -3 : -2).join('.');
    const permitted = (value: string) => {
      const safe = publicHttpUrl(value);
      if (!safe || !base) return false;
      const url = new URL(safe);
      return url.protocol === 'https:' && (!url.port || url.port === '443') && (url.hostname === base || url.hostname.endsWith(`.${base}`));
    };
    let url = story.url;
    let response: Response | undefined;
    for (let redirect = 0; redirect < 4; redirect++) {
      if (!permitted(url)) return { ...story, source_fetch_status: 'untrusted-source-url' };
      response = await fetch(url, {
      headers: {
        "user-agent": "SignalBrief/1.0",
        accept: "text/html,application/xhtml+xml"
      },
      redirect: "manual",
      signal: controller.signal
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) break;
      url = new URL(location, url).href;
    }
    if (!response) return { ...story, source_fetch_status: 'fetch-failed' };
    if (!response.ok) return { ...story, source_fetch_status: `http-${response.status}` };

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return { ...story, source_fetch_status: "unsupported-content-type" };
    }

    const reader = response.body?.getReader();
    if (!reader) return { ...story, source_fetch_status: 'empty-body' };
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 2_000_000) { await reader.cancel(); return { ...story, source_fetch_status: 'source-too-large' }; }
      chunks.push(part.value);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    const article_access = detectArticleAccess(html);
    const sourceText = extractReadableSourceText(html);
    if (sourceText.length < MIN_USEFUL_SOURCE_TEXT_LENGTH) {
      return { ...story, article_access, source_fetch_status: "insufficient-source-text" };
    }
    return { ...story, article_access, source_text: sourceText, source_fetch_status: "full-source" };
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
