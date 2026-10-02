import { NextRequest, NextResponse } from "next/server";

import { authenticateDailySignalRequest } from "@/lib/email/auth";
import {
  getDailySignalHttpStatus,
  runDailySignal
} from "@/lib/email/daily-signal";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handleRequest(request: NextRequest) {
  const trigger = authenticateDailySignalRequest(request.method, request.headers);

  if (!trigger) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (trigger === "vercel-cron" && process.env.DAILY_SIGNAL_ENABLED !== "true") {
    console.log("[daily-signal] scheduled sending disabled");
    return NextResponse.json({
      success: true,
      status: "disabled",
      reason: "Scheduled Daily Signal sending is disabled"
    });
  }

  try {
    const result = await runDailySignal({ enforceSendWindow: trigger === "vercel-cron" });
    return NextResponse.json(result, { status: getDailySignalHttpStatus(result) });
  } catch {
    console.error("[daily-signal] unexpected failure");
    return NextResponse.json({success:false,error:"Daily Signal unavailable"}, {status:503});
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
