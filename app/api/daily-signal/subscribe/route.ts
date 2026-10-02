import { NextRequest, NextResponse } from 'next/server';
import { normalizeSubscriberEmail } from '@/lib/email/subscribers';
import { requestConfirmation } from '@/lib/email/confirmation';
import { FormError, formFailure, rateLimit, readPublicForm } from '@/lib/public-forms';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await readPublicForm(request);
    if (body.company) return NextResponse.json({ success: true });
    const email = normalizeSubscriberEmail(body.email);
    if (!email) throw new FormError(400, 'Enter a valid email address.');
    await rateLimit(request, 'signup');
    await rateLimit(request, 'signup-email', 3, 3600, email);
    await requestConfirmation(email, body.attribution);
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return formFailure(error, 'signup'); }
}
