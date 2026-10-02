/** Only public HTTP links are suitable for reader navigation and source suggestions. */
export function publicHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') ||
      host.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(host)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function canonicalStoryUrl(value: string) {
  const safe = publicHttpUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  }
  return url.href.replace(/\/$/, '');
}
