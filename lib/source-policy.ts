// Operational exclusions, not a blanket legal determination about other sources.
// Reviewed 2026-10-23. Preserve already published stories; stop new processing.
export const excludedSources = [
  { name: "The Verge", domains: ["theverge.com"], terms: "https://www.pmc.com/terms-of-use" },
  { name: "WIRED", domains: ["wired.com"], terms: "https://www.condenast.com/user-agreement" },
  { name: "Ars Technica", domains: ["arstechnica.com"], terms: "https://www.condenast.com/user-agreement" }
] as const;

export function isSourceProcessingAllowed(source: string, url?: string): boolean {
  const normalizedName = source.trim().toLowerCase();
  let host = "";
  try { host = url ? new URL(url).hostname.toLowerCase().replace(/\.$/, "") : ""; } catch { /* URL validation remains with callers. */ }
  return !excludedSources.some(entry => entry.name.toLowerCase() === normalizedName ||
    entry.domains.some(domain => host === domain || host.endsWith(`.${domain}`)));
}

export function isStoryProcessingAllowed(story: { source: string; url: string }): boolean {
  return isSourceProcessingAllowed(story.source, story.url);
}
