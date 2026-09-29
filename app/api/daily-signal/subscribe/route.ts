import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

import { allowSignupAttempt } from "@/lib/email/rate-limit";
import { formatSignalBriefFrom } from "@/lib/email/transport";
import {
  createSupabaseSubscriberStore,
  normalizeSubscriberEmail,
  subscriberLogId
} from "@/lib/email/subscribers";

export const dynamic = "force-dynamic";

async function sendSignupNotification(email: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipient = process.env.DAILY_SIGNAL_RECIPIENT?.trim();
  const configuredFrom = process.env.DAILY_SIGNAL_FROM?.trim();
  if (!apiKey || !recipient || !configuredFrom) return;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: formatSignalBriefFrom(configuredFrom),
    to: [recipient],
    subject: "New Signal Brief subscriber",
    text: `New subscriber: ${email}`,
    html: `<p><strong>New Signal Brief subscriber</strong></p><p>${email.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`,
    tags: [{ name: "notification", value: "new-subscriber" }]
  });

  if (error) throw new Error(error.message);
}

export async function POST(request: NextRequest) {
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowSignupAttempt(clientKey)) {
    return NextResponse.json({ success: false, error: "Unable to subscribe" }, { status: 429 });
  }

  try {
    const body = await request.json();
    if (body?.company) return NextResponse.json({ success: true });

    const email = normalizeSubscriberEmail(body?.email);
    if (!email) {
      return NextResponse.json({ success: false, error: "Enter a valid email address" }, { status: 400 });
    }

    await createSupabaseSubscriberStore().subscribe(email, new Date().toISOString());

    try {
      await sendSignupNotification(email);
    } catch (notificationError) {
      console.error(
        "[daily-signal-signup] notification failed",
        notificationError instanceof Error ? notificationError.message : "unknown error"
      );
    }

    console.log(`[daily-signal-signup] activated subscriber ${subscriberLogId(email)}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "[daily-signal-signup] failed",
      error instanceof Error ? error.message.replace(/[^\\s]+@[^\\s]+/g, "[redacted-email]") : "unknown error"
    );
    return NextResponse.json({ success: false, error: "Unable to subscribe" }, { status: 500 });
  }
}
