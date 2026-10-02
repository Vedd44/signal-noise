import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

export class FormError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function readPublicForm(request: NextRequest): Promise<Record<string, unknown>> {
  const origin = request.headers.get('origin');
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname);
  const allowedOrigin = origin === SITE_URL || (!process.env.VERCEL && localHost && origin === request.nextUrl.origin);
  if ((origin && !allowedOrigin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new FormError(403, 'Please submit this form from Signal Brief.');
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new FormError(415, 'Use a JSON request.');
  const reader = request.body?.getReader();
  if (!reader) throw new FormError(400, 'Check the form and try again.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new FormError(413, 'This submission is too long.'); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid body');
    return body;
  } catch (error) {
    if (error instanceof FormError) throw error;
    throw new FormError(400, 'Check the form and try again.');
  }
}

export async function rateLimit(request: NextRequest, scope: string, limit = 5, seconds = 60, identity?: string) {
  const secret = process.env.PIPELINE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Rate limiter configuration unavailable');
  const client = identity ?? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const key = createHmac('sha256', secret).update(`${scope}:${client}`).digest('hex');
  const { data, error } = await getSupabaseServiceClient().rpc('claim_public_request', {
    request_key: key, max_attempts: limit, window_seconds: seconds
  });
  if (error) throw new Error('Rate limiter unavailable');
  if (!data) throw new FormError(429, 'Please wait a minute before trying again.');
}

export function formFailure(error: unknown, context: string) {
  if (!(error instanceof FormError)) console.error(`[${context}] request failed`);
  return NextResponse.json({ success: false, error: error instanceof FormError ? error.message : 'We couldn’t complete that right now. Please try again.' }, {
    status: error instanceof FormError ? error.status : 503,
    headers: { 'Cache-Control': 'no-store', ...(error instanceof FormError && error.status === 429 ? { 'Retry-After': '60' } : {}) }
  });
}

export function textField(value: unknown, max: number, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new FormError(400, 'Check the form and try again.');
  return value.trim();
}
