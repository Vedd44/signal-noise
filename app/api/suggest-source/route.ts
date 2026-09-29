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

    const name = clean(body?.name, 120);
    const url = clean(body?.url, 500);
    const reason = clean(body?.reason, 1000);
    if (!name || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const recipient = process.env.DAILY_SIGNAL_RECIPIENT?.trim();
    const configuredFrom = process.env.DAILY_SIGNAL_FROM?.trim();
    if (!apiKey || !recipient || !configuredFrom) throw new Error("Email configuration unavailable");

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: formatSignalBriefFrom(configuredFrom),
      to: [recipient],
      subject: `Signal Brief source suggestion: ${name}`,
      text: [`Source: ${name}`, `URL: ${url}`, reason ? `Why: ${reason}` : ""].filter(Boolean).join("\n"),
      html: `<p><strong>New source suggestion</strong></p><p><strong>Source:</strong> ${escapeHtml(name)}<br><strong>URL:</strong> <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>${reason ? `<br><strong>Why:</strong> ${escapeHtml(reason)}` : ""}</p>`,
      tags: [{ name: "notification", value: "source-suggestion" }]
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[source-suggestion] failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
