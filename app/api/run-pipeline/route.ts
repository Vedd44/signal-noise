import { NextRequest, NextResponse } from "next/server";

import { runFullPipeline } from "@/lib/pipeline/run";

export const dynamic = "force-dynamic";

function getAuthorizationSecrets() {
  const secrets = [
    process.env.PIPELINE_SECRET,
    process.env.CRON_SECRET
  ].filter((value): value is string => Boolean(value));

  if (secrets.length === 0) {
    throw new Error(
      "Missing PIPELINE_SECRET or CRON_SECRET in environment variables"
    );
  }

  return Array.from(new Set(secrets));
}

function isAuthorized(request: NextRequest) {
  const authorizationSecrets = getAuthorizationSecrets();
  const manualSecret = process.env.PIPELINE_SECRET;
  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-pipeline-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");

  return (
    authorizationSecrets.some((secret) => authHeader === `Bearer ${secret}`) ||
    (Boolean(manualSecret) &&
      (headerSecret === manualSecret || querySecret === manualSecret))
  );
}

async function handleRequest(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized"
        },
        { status: 401 }
      );
    }

    const result = await runFullPipeline();

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        success: false,
        error: message,
        processedCount: 0,
        enrichedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        sourceFailures: [],
        skippedEnrichment: []
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
