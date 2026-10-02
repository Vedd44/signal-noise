export const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
export type Campaign = Partial<Record<typeof CAMPAIGN_KEYS[number], string>>;

// Campaign identifiers only. Reject emails, URLs, tokens and arbitrary form data.
export function cleanCampaign(value: unknown): Campaign {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const campaign: Campaign = {};
  for (const key of CAMPAIGN_KEYS) {
    const v = input[key];
    if (typeof v === 'string' && /^[a-zA-Z0-9 _.-]{1,80}$/.test(v)) campaign[key] = v;
  }
  return campaign;
}

export function campaignFromUrl(value: string): Campaign {
  try { return cleanCampaign(Object.fromEntries(new URL(value).searchParams)); } catch { return {}; }
}
