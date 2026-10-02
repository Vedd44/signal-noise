import { NextRequest, NextResponse } from 'next/server';
import { confirmSubscription } from '@/lib/email/confirmation';
import { FormError, formFailure, readPublicForm, rateLimit } from '@/lib/public-forms';

export async function POST(request: NextRequest) {
  try {
    const body = await readPublicForm(request);
    await rateLimit(request, 'confirm', 20);
    if (!await confirmSubscription(body.token)) throw new FormError(400, 'This confirmation link is invalid or has expired. Request a new one from the signup form.');
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return formFailure(error, 'confirmation'); }
}
