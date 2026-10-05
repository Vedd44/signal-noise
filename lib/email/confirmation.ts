import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseServiceClient } from '@/lib/db';
import { cleanCampaign } from '@/lib/attribution';
import { sendEmail, formatSignalBriefFrom } from '@/lib/email/transport';
import { SITE_URL } from '@/lib/site';

export function confirmationTokenHash(value: unknown) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    ? createHash('sha256').update(value).digest('hex') : null;
}

export function renderConfirmationEmail(token: string) {
  const url = `${SITE_URL}/daily-signal/confirm?token=${token}`;
  return {
    subject: 'Confirm your Daily Signal subscription',
    text: `One quick step: confirm your email to receive the Daily Signal each morning around 8:10 AM Eastern.\n\n${url}\n\nThis link expires in 24 hours. If you didn’t request this, ignore this email. You won’t be subscribed.`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f0e8;color:#25241f;font-family:Arial,sans-serif"><div style="max-width:520px;padding:36px 24px;margin:auto"><p style="font-family:Georgia,serif;font-size:20px;font-weight:bold">Signal Brief</p><h1 style="font-family:Georgia,serif;font-size:30px">Confirm your Daily Signal subscription.</h1><p style="line-height:1.6">The stories worth knowing, and why they matter. In your inbox each morning around 8:10 AM Eastern.</p><p style="margin:28px 0"><a href="${url}" style="display:inline-block;background:#bc3518;color:#fff;padding:15px 20px;text-decoration:none">Confirm subscription →</a></p><p style="font-size:13px;line-height:1.6">This link expires in 24 hours. If you didn’t request this, ignore this email. You won’t be subscribed.</p></div></body></html>`
  };
}

export async function requestConfirmation(email: string, attribution: unknown) {
  // Resolve configuration before creating a pending record.
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.DAILY_SIGNAL_FROM?.trim();
  if (!apiKey || !from) throw new Error('Confirmation email unavailable');
  const token = randomBytes(32).toString('hex');
  const hash = confirmationTokenHash(token)!;
  const db = getSupabaseServiceClient();
  const { data, error } = await db.rpc('prepare_daily_signal_signup', {
    subscriber_email: email, token_hash: hash, campaign: cleanCampaign(attribution)
  });
  if (error) throw new Error('Unable to prepare signup');
  if (!data) return; // Same public response for active, pending, and new addresses.
  try {
    await sendEmail(apiKey, { from: formatSignalBriefFrom(from), to: [email], ...renderConfirmationEmail(token) }, `confirm/${hash}`);
  } catch (error) {
    // A failed provider request must not block the reader's next retry.
    await db.from('daily_signal_subscribers').update({ confirmation_requested_at: null })
      .eq('confirmation_token_hash', hash).eq('status', 'pending');
    throw error;
  }
}

export async function confirmSubscription(token: unknown) {
  const hash = confirmationTokenHash(token);
  if (!hash) return false;
  const { data, error } = await getSupabaseServiceClient().rpc('confirm_daily_signal_signup', { token_hash: hash });
  if (error) throw new Error('Confirmation unavailable');
  return data === true;
}
