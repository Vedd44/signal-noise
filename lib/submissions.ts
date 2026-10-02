import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/db';
import { FormError, formFailure, rateLimit, readPublicForm, textField } from '@/lib/public-forms';
import { publicHttpUrl } from '@/lib/urls';
import { sendEmail, formatSignalBriefFrom } from '@/lib/email/transport';

export function parseSubmission(kind: 'feature' | 'source', body: Record<string, unknown>) {
  if (kind === 'feature') return { request: textField(body.request, 1000, true), details: textField(body.details, 1000) };
  const url = publicHttpUrl(textField(body.url, 500, true));
  if (!url) throw new FormError(400, 'Enter a full public website URL, starting with https://.');
  return { name: textField(body.name, 120, true), url, reason: textField(body.reason, 1000) };
}

export async function notifySubmission(id: string, kind: string, payload: object) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipient = process.env.DAILY_SIGNAL_RECIPIENT?.trim();
  const from = process.env.DAILY_SIGNAL_FROM?.trim();
  if (!apiKey || !recipient || !from) throw new Error('Notification configuration unavailable');
  const text = Object.entries(payload).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join('\n\n');
  const escaped = text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  await sendEmail(apiKey, {
    from: formatSignalBriefFrom(from), to: [recipient], subject: `Signal Brief ${kind === 'source' ? 'source suggestion' : 'feature request'}`,
    text, html: `<p>New reader submission</p><pre style="white-space:pre-wrap">${escaped}</pre>`
  }, `reader-submission/${id}`);
  const result = await getSupabaseServiceClient().from('reader_submissions').update({ notified_at: new Date().toISOString() }).eq('id', id);
  if (result.error) throw new Error('Notification status unavailable');
}

export async function handleSubmission(request: NextRequest, kind: 'feature' | 'source') {
  try {
    const body = await readPublicForm(request);
    if (body.company) return NextResponse.json({ success: true });
    const payload = parseSubmission(kind, body);
    await rateLimit(request, 'feedback');
    const key = createHash('sha256').update(JSON.stringify([kind, payload, Math.floor(Date.now()/600_000)])).digest('hex');
    const result = await getSupabaseServiceClient().from('reader_submissions').insert({ kind, payload, dedupe_key: key }).select('id').single();
    if (result.error?.code === '23505') return NextResponse.json({ success: true });
    if (result.error) throw new Error('Submission storage unavailable');
    try { await notifySubmission(result.data.id, kind, payload); }
    catch { console.error('[reader-submission] saved; notification pending'); }
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return formFailure(error, 'reader-submission'); }
}

export async function retrySubmissionNotifications() {
  const result = await getSupabaseServiceClient().from('reader_submissions').select('id,kind,payload')
    .is('notified_at', null).gte('created_at', new Date(Date.now()-23*3600_000).toISOString()).order('created_at').limit(5);
  if (result.error) throw new Error('Submission notification lookup failed');
  for (const row of result.data) await notifySubmission(row.id, row.kind, row.payload);
}
