export type DailySignalTrigger = "vercel-cron" | "manual";

type DailySignalAuthEnvironment = {
  CRON_SECRET?: string;
  PIPELINE_SECRET?: string;
};

export function authenticateDailySignalRequest(
  method: string,
  headers: Headers,
  environment: DailySignalAuthEnvironment = {
    CRON_SECRET: process.env.CRON_SECRET,
    PIPELINE_SECRET: process.env.PIPELINE_SECRET
  }
): DailySignalTrigger | null {
  const authorization = headers.get("authorization");

  if (
    method === "GET" &&
    environment.CRON_SECRET &&
    authorization === `Bearer ${environment.CRON_SECRET}`
  ) {
    return "vercel-cron";
  }

  if (method === "POST" && environment.PIPELINE_SECRET) {
    const headerSecret = headers.get("x-pipeline-secret");

    if (
      authorization === `Bearer ${environment.PIPELINE_SECRET}` ||
      headerSecret === environment.PIPELINE_SECRET
    ) {
      return "manual";
    }
  }

  return null;
}
