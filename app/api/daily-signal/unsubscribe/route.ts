import { NextRequest, NextResponse } from "next/server";

import { createSupabaseSubscriberStore, verifyUnsubscribeToken } from "@/lib/email/subscribers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const subscriberId = verifyUnsubscribeToken(body?.token);
    if (!subscriberId) {
      return NextResponse.json({ success: false, error: "Invalid unsubscribe link" }, { status: 400 });
    }
    await createSupabaseSubscriberStore().unsubscribe(subscriberId, new Date().toISOString());
    console.log("[daily-signal-unsubscribe] subscriber suppressed");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[daily-signal-unsubscribe] failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ success: false, error: "Unable to unsubscribe" }, { status: 500 });
  }
}
