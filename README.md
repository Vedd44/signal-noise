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
CRON_SECRET=your_vercel_cron_secret
RESEND_API_KEY=your_resend_sending_key
DAILY_SIGNAL_RECIPIENT=owner@example.com
DAILY_SIGNAL_FROM=Signal > Noise <briefing@your_verified_domain>
DAILY_SIGNAL_ENABLED=false
DAILY_SIGNAL_UNSUBSCRIBE_SECRET=your_random_secret_of_at_least_32_characters
```

This key is used only for the local enrichment step and should remain server-side only.
Restart the dev server or any running scripts after adding or changing `.env.local`.
Local scripts such as `npm run ingest` and `npm run enrich` also load `.env.local` directly.
Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
Keep `PIPELINE_SECRET` server-side only.
For Vercel Cron, also set `CRON_SECRET` in the Vercel project settings. The simplest setup is to give `CRON_SECRET` the same value as `PIPELINE_SECRET`.
`RESEND_API_KEY`, `DAILY_SIGNAL_RECIPIENT`, `DAILY_SIGNAL_FROM`, and `DAILY_SIGNAL_UNSUBSCRIBE_SECRET` are server-side only.
Leave `DAILY_SIGNAL_ENABLED=false` or unset until the Daily Signal test email and sending domain have been confirmed.

## Available Scripts

- `npm run dev` starts the local app
- `npm run build` creates a production build
- `npm run start` serves the production build
- `npm run lint` runs ESLint
- `npm run typecheck` runs TypeScript checks
- `npm run test:daily-signal` validates email selection, rendering, authorization, scheduling, duplicate protection, and failures without sending email
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

- `OPENAI_MODEL` overrides the default `gpt-5.6-terra` model used for enrichment
- `ENRICH_BATCH_SIZE` limits how many normalized stories are processed in one run

The script reads `data/normalized-stories.json`, generates `summary`, `why_it_matters`, `tag`, and `score`, prints a readable terminal summary, and writes the enriched output to `data/enriched-stories.json`.

## Local Content Flow

1. Run `npm run ingest`
2. Run `npm run enrich`
3. Run `npm run dev` and open the homepage to view the latest stories from Supabase

The enrichment step keeps a local debug file in `data/enriched-stories.json`, upserts stories into Supabase, and the homepage reads published stories from Supabase. If Supabase has no stories yet, the app renders a clean empty state instead of crashing.

## Supabase

Apply the schema in `supabase/schema.sql` to your Supabase project before running enrichment.

Stories are stored in the `stories` table and read back through the shared freshness-adjusted, source-diversified feed ordering.
The homepage reads with the anon key, so RLS should allow public read-only access to rows where `status = 'published'`.

The schema also contains private `daily_signal_sends`, `daily_signal_deliveries`, and `daily_signal_subscribers` tables. RLS is enabled without public subscriber or delivery policies; server-side service-role code is the only application access path. Apply the latest `supabase/schema.sql` before testing Daily Signal signup or sends.

For the production public-signup launch, run `supabase/daily-signal-public-launch.sql`. It creates only the subscriber/delivery objects and their shared timestamp trigger dependency; it does not alter stories or the existing `daily_signal_sends` table.

## Automated Pipeline

The secured server-side route is:

```text
/api/run-pipeline
```

Pass the secret with either:

- `Authorization: Bearer $PIPELINE_SECRET`
- `x-pipeline-secret: $PIPELINE_SECRET`

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

The pipeline checks candidate URLs and IDs in Supabase before enrichment. Unchanged existing stories are skipped without an OpenAI request; changed content on an existing URL is re-enriched while retaining the stored ID.

### Source roster and inventory health

The production RSS roster and its per-run limits live in `lib/feeds.ts`. Each source also carries static publication-level accessibility metadata (`open`, `mostly_open`, `metered`, `mostly_paywalled`, `mixed`, or `unknown`). Accessibility is observational metadata only and does not affect ranking.

The application cleanup mirrors the external Supabase cleanup policy by deleting published stories older than 72 hours regardless of score. After each full pipeline run, published inventory is also capped at six stories per source; the cap keeps the six strongest current stories using the existing score and freshness ranking signals. Draft or other non-published rows are excluded from both cleanup operations.

Source priority currently has two configuration concepts: `editorial_priority` on the RSS source and `SOURCE_PRIORITY_BOOSTS` in scoring. `editorial_priority` remains unused, and the existing scoring behavior is intentionally unchanged. Consolidating these concepts is future technical debt rather than part of the Source Roster V2 rollout.

## Model Evaluation

To compare the audited 10-story sample across `gpt-5.2`, `gpt-5.6-terra`, and `gpt-5.6-luna` without writing to Supabase, run:

```bash
npm run model-eval
```

This command makes paid OpenAI API requests and writes the ignored local result to `tmp/model-eval.json`. It records validated editorial output, latency, token usage, estimated cost, and blank human-review fields for each criterion. It does not run automatically as part of the production pipeline.

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

## Daily Signal Email

Daily Signal is a public opt-in email briefing sent with Resend. The configured owner recipient remains included, and the email reuses the same ordered story set as the website:

1. The Lead is the current overall ranked story #1
2. Worth Knowing is ranked stories #2–4
3. On the Radar selects up to six current remaining stories while first limiting obvious source and topic repetition

The email contains direct publisher links and a final link to `https://www.signalbrief.xyz/`. Public subscribers receive a signed, account-free unsubscribe link; the owner copy remains exempt.

Public signup uses server-side validation, a honeypot, and a lightweight five-attempts-per-minute limiter. That limiter is held in process memory and is therefore per instance, not a globally durable distributed rate limit.

### Resend setup

1. Create a Resend account.
2. Add and verify the domain or sending subdomain you will use.
3. Create a sending-access API key.
4. Set `RESEND_API_KEY` to that key.
5. Set `DAILY_SIGNAL_FROM` to a sender on the verified domain, for example `Signal > Noise <briefing@updates.signalbrief.xyz>`.
6. Set `DAILY_SIGNAL_RECIPIENT` to the owner recipient.
7. Set `DAILY_SIGNAL_UNSUBSCRIBE_SECRET` to a random secret of at least 32 characters.

Do not enable scheduled sending yet. Keep `DAILY_SIGNAL_ENABLED=false` until the schema, sender, recipient, and controlled manual test are confirmed.

### Preview without sending

In local development, open:

```text
http://localhost:3000/api/daily-signal/preview
```

The preview route renders the current briefing as email HTML, never sends, uses `no-store`, and returns 404 in production.

### Protected manual test

After applying the Supabase schema and configuring Resend, send one deliberate test with:

```bash
curl -X POST https://www.signalbrief.xyz/api/daily-signal \
  -H "Authorization: Bearer $PIPELINE_SECRET"
```

The manual POST works while scheduled sending is disabled. It is idempotent for the current New York calendar date, so retries will not intentionally create another daily briefing.

### Daily schedule and DST

Vercel calls `/api/daily-signal` at both `12:10` and `13:10` UTC. The server converts the invocation time to `America/New_York` and proceeds only during the local 8:10–8:19 AM window. This produces one valid 8:10 AM invocation across daylight and standard time; the other invocation exits without selecting or sending.

Scheduled requests require Vercel's `Authorization: Bearer $CRON_SECRET` header and also require `DAILY_SIGNAL_ENABLED=true`. With the flag absent or false, cron requests return a disabled result without reading stories, claiming a date, or contacting Resend.

### Recipient privacy and duplicate-send protection

Before transport, the server claims the local date in `daily_signal_sends`. Each owner/subscriber delivery then receives its own claim in `daily_signal_deliveries` and its own Resend request, so addresses are never placed together in To or CC. Successful recipient rows are skipped during a campaign retry; failed rows can be atomically reclaimed. Resend also receives a stable idempotency key derived from the local date and complete individual provider request, protecting the accepted-but-not-recorded failure case. A campaign is marked sent only after every recipient is sent or already recorded as sent.

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
