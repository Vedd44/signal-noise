import { NextRequest, NextResponse } from "next/server";

import { runTrackedPipeline } from "@/lib/pipeline/run";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function getTriggerType(request: NextRequest) {
  const manualSecret = process.env.PIPELINE_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  if (!manualSecret && !cronSecret) {
    throw new Error("Missing PIPELINE_SECRET or CRON_SECRET in environment variables");
  }

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-pipeline-secret");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return "vercel-cron";
  }

  if (
    manualSecret &&
    (authHeader === `Bearer ${manualSecret}` || headerSecret === manualSecret)
  ) {
    return "manual";
  }

  return null;
}

async function handleRequest(request: NextRequest) {
  try {
    const triggerType = getTriggerType(request);

    if (!triggerType) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized"
        },
        { status: 401 }
      );
    }

    if (triggerType === "manual") {
      console.log("[pipeline] manual trigger");
    } else {
      console.log("[pipeline] vercel cron trigger");
    }

    const result = await runTrackedPipeline();

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      "[pipeline] fatal",
      JSON.stringify({ event: "pipeline_failed", error: message })
    );

    return NextResponse.json(
      {
        success: false,
        error: "Pipeline failed; inspect private execution logs",
        candidatesDiscovered: 0,
        alreadyExistingSkipped: 0,
        nonEnglishRejected: 0,
        sentToAI: 0,
        processedCount: 0,
        enrichedCount: 0,
        rejectedCount: 0,
        writtenCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        deletedCount: 0,
        retentionDeletedCount: 0,
        sourceCapDeletedCount: 0,
        retentionCutoff: new Date(0).toISOString(),
        sourceFailures: [],
        skippedEnrichment: [],
        aiUsage: {
          model: process.env.OPENAI_MODEL ?? "gpt-6-luna",
          requestCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalLatencyMs: 0,
          retryCount: 0
        }
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
