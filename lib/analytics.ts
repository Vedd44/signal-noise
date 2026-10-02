import { campaignFromUrl, cleanCampaign, type Campaign } from '@/lib/attribution';

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; }
}

type LaunchEvent = 'signup_started' | 'signup_submitted' | 'source_request' | 'feature_request' | 'story_click' | 'view_change' | 'engaged_reading';
export function track(event: LaunchEvent, properties: { view?: 'list' | 'compact'; source?: string; category?: string } = {}) {
  if (typeof window === 'undefined') return;
  window.gtag?.('event', event, properties);
}

export function captureCampaign(): Campaign {
  if (typeof window === 'undefined') return {};
  const current = campaignFromUrl(window.location.href);
  try {
    if (Object.keys(current).length) sessionStorage.setItem('signal-campaign', JSON.stringify(current));
    return cleanCampaign(JSON.parse(sessionStorage.getItem('signal-campaign') || '{}'));
  } catch { return current; }
}

export function safeAnalyticsLocation(value: string) {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  for (const [key, v] of Object.entries(campaignFromUrl(value))) url.searchParams.set(key, v);
  return url.href;
}
