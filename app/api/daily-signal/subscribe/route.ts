import { NextRequest, NextResponse } from "next/server";

import { allowSignupAttempt } from "@/lib/email/rate-limit";
import {
  createSupabaseSubscriberStore,
  normalizeSubscriberEmail,
  subscriberLogId
} from "@/lib/email/subscribers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowSignupAttempt(clientKey)) {
    return NextResponse.json({ success: false, error: "Unable to subscribe" }, { status: 429 });
  }

  try {
    const body = await request.json();
    // Honeypot submissions receive a neutral success response.
    if (body?.company) return NextResponse.json({ success: true });

    const email = normalizeSubscriberEmail(body?.email);
    if (!email) {
      return NextResponse.json({ success: false, error: "Enter a valid email address" }, { status: 400 });
    }
    await createSupabaseSubscriberStore().subscribe(email, new Date().toISOString());

    console.log(`[daily-signal-signup] activated subscriber ${subscriberLogId(email)}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[daily-signal-signup] failed", error instanceof Error ? error.message.replace(/[^\s]+@[^\s]+/g, "[redacted-email]") : "unknown error");
    return NextResponse.json({ success: false, error: "Unable to subscribe" }, { status: 500 });
  }
}
