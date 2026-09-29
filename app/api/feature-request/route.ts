import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

import { formatSignalBriefFrom } from "@/lib/email/transport";

export const dynamic = "force-dynamic";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body?.company) return NextResponse.json({ success: true });

    const featureRequest = clean(body?.request, 1000);
    const details = clean(body?.details, 1000);
    if (!featureRequest) return NextResponse.json({ success: false }, { status: 400 });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const recipient = process.env.DAILY_SIGNAL_RECIPIENT?.trim();
    const configuredFrom = process.env.DAILY_SIGNAL_FROM?.trim();
    if (!apiKey || !recipient || !configuredFrom) throw new Error("Email configuration unavailable");

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: formatSignalBriefFrom(configuredFrom),
      to: [recipient],
      subject: "Signal Brief feature request",
      text: [`Request: ${featureRequest}`, details ? `Details: ${details}` : ""].filter(Boolean).join("\n\n"),
      html: `<p><strong>New feature request</strong></p><p>${escapeHtml(featureRequest)}</p>${details ? `<p><strong>Additional detail</strong><br>${escapeHtml(details)}</p>` : ""}`,
      tags: [{ name: "notification", value: "feature-request" }]
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[feature-request] failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
