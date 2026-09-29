import { NextResponse } from "next/server";

import { getPublishedStories } from "@/lib/data";
import { renderDailySignalEmail } from "@/lib/email/render";
import { selectDailySignalStories } from "@/lib/email/selection";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const now = new Date();
  const { stories } = await getPublishedStories();
  const selection = selectDailySignalStories(stories, now.getTime());

  if (!selection) {
    return new NextResponse("No eligible stories are available for preview.", { status: 503 });
  }

  const rendered = renderDailySignalEmail(selection, now);

  return new NextResponse(rendered.html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}
