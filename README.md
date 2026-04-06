# Signal > Noise

Signal > Noise is a clean, editorial-style feed of high-signal stories across AI, media, and digital strategy. The project is intentionally small and local-first, but it now includes the core content pipeline: RSS ingestion, AI enrichment, Supabase storage, and a secured automation route.

## Stack

- Next.js App Router
- TypeScript
- React

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Start the local dev server:

```bash
npm run dev
```

3. Open `http://localhost:3000`

## Environment Variables

Create a `.env.local` file in the project root with:

```bash
OPENAI_API_KEY=your_api_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
PIPELINE_SECRET=your_long_random_secret
```

This key is used only for the local enrichment step and should remain server-side only.
Restart the dev server or any running scripts after adding or changing `.env.local`.
Local scripts such as `npm run ingest` and `npm run enrich` also load `.env.local` directly.
Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
Keep `PIPELINE_SECRET` server-side only.
For Vercel Cron, also set `CRON_SECRET` in the Vercel project settings. The simplest setup is to give `CRON_SECRET` the same value as `PIPELINE_SECRET`.

## Available Scripts

- `npm run dev` starts the local app
- `npm run build` creates a production build
- `npm run start` serves the production build
- `npm run lint` runs ESLint
- `npm run typecheck` runs TypeScript checks
- `npm run ingest` fetches and normalizes local RSS stories
- `npm run enrich` enriches normalized stories with AI and writes local JSON output

## Local Ingestion

Run the RSS ingestion pipeline locally with:

```bash
npm run ingest
```

The script fetches all configured RSS feeds, normalizes recent entries into a shared pre-enrichment shape, prints a readable summary in the terminal, and writes the full result set to `data/normalized-stories.json`.

## Local Enrichment

Run the enrichment pipeline locally with:

```bash
npm run enrich
```

The enrichment script loads `.env.local` before running, so restart any running processes after updating that file.

Optional environment variables:

- `OPENAI_MODEL` overrides the default model used for enrichment
- `ENRICH_BATCH_SIZE` limits how many normalized stories are processed in one run

The script reads `data/normalized-stories.json`, generates `summary`, `why_it_matters`, `tag`, and `score`, prints a readable terminal summary, and writes the enriched output to `data/enriched-stories.json`.

## Local Content Flow

1. Run `npm run ingest`
2. Run `npm run enrich`
3. Run `npm run dev` and open the homepage to view the latest stories from Supabase

The enrichment step keeps a local debug file in `data/enriched-stories.json`, upserts stories into Supabase, and the homepage reads published stories from Supabase. If Supabase has no stories yet, the app renders a clean empty state instead of crashing.

## Supabase

Apply the schema in `supabase/schema.sql` to your Supabase project before running enrichment.

Stories are stored in the `stories` table and read back on the homepage ordered by `score desc` and then `published_at desc`.

## Automated Pipeline

The secured server-side route is:

```text
/api/run-pipeline
```

Pass the secret with either:

- `Authorization: Bearer $PIPELINE_SECRET`
- `x-pipeline-secret: $PIPELINE_SECRET`
- `?secret=$PIPELINE_SECRET`

The route runs the full pipeline:

1. fetch RSS sources
2. normalize stories
3. enrich stories
4. upsert into Supabase

It returns JSON with success state, processed counts, insert/update counts, and any source failures.

Vercel Cron is configured in [vercel.json](/Users/jonnyhpl/Desktop/signal-noise/vercel.json) to hit the route every 6 hours:

```json
{
  "crons": [
    {
      "path": "/api/run-pipeline",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

Vercel Cron runs in UTC, so this fires at `00:00`, `06:00`, `12:00`, and `18:00` UTC. On Vercel, cron-triggered requests arrive as `Authorization: Bearer $CRON_SECRET`, and the route also continues to support manual triggering with `PIPELINE_SECRET`.

## Production Scheduling

To run the pipeline automatically in production, add these environment variables in the Vercel project settings:

- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PIPELINE_SECRET`
- `CRON_SECRET`

Recommended setup:

- Set `CRON_SECRET` to the same value as `PIPELINE_SECRET`
- Keep both secrets in Production only unless you explicitly need Preview testing

Manual production test:

```bash
curl -X POST https://your-production-domain/api/run-pipeline \
  -H "Authorization: Bearer $PIPELINE_SECRET"
```

If a scheduled or manual run fails, inspect:

- Vercel Function logs for `/api/run-pipeline`
- Vercel deployment logs around the scheduled invocation time
- Supabase logs if writes are failing after enrichment

Vercel note:

- Cron jobs run on production deployments and use UTC timing.

## Project Structure

```text
signal-noise/
├─ app/
│  ├─ api/
│  │  └─ run-pipeline/
│  │     └─ route.ts
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx
├─ components/
│  ├─ Feed.tsx
│  ├─ Header.tsx
│  └─ StoryCard.tsx
├─ data/
│  ├─ enriched-stories.json
│  └─ normalized-stories.json
├─ lib/
│  ├─ db.ts
│  ├─ data.ts
│  ├─ dedupe.ts
│  ├─ env.ts
│  ├─ feeds.ts
│  ├─ openai.ts
│  ├─ pipeline/
│  │  ├─ enrich.ts
│  │  ├─ ingest.ts
│  │  └─ run.ts
│  ├─ prompts.ts
│  ├─ scoring.ts
│  └─ utils.ts
├─ scripts/
│  ├─ enrich.ts
│  └─ ingest.ts
├─ supabase/
│  └─ schema.sql
├─ types/
│  └─ story.ts
├─ README.md
├─ vercel.json
├─ eslint.config.mjs
├─ next.config.ts
├─ package.json
└─ tsconfig.json
```

## Notes

- RSS sources remain defined in `lib/feeds.ts`, but homepage rendering now comes from Supabase.
- The secured `/api/run-pipeline` route is the automation path for ingest → enrich → store.
- No auth, admin UI, or background infrastructure is included in this foundation.
