import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseSubscriberStore, verifyUnsubscribeToken } from '@/lib/email/subscribers';
import { FormError, formFailure, readPublicForm } from '@/lib/public-forms';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // RFC 8058 mailbox-provider POSTs have no same-origin browser context.
    const oneClick = request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded');
    const token = oneClick ? request.nextUrl.searchParams.get('token') : (await readPublicForm(request)).token;
    const subscriberId = verifyUnsubscribeToken(token);
    if (!subscriberId) throw new FormError(400, 'This unsubscribe link is invalid. Use the link in your latest Daily Signal email.');
    await createSupabaseSubscriberStore().unsubscribe(subscriberId, new Date().toISOString());
    return NextResponse.json({ success: true }, {headers:{'Cache-Control':'no-store'}});
  } catch(error) { return formFailure(error, 'unsubscribe'); }
}
