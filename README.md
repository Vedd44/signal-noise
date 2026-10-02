# Signal Brief

Signal Brief is an editorial news briefing at https://www.signalbrief.xyz/. Each story pairs a concise summary with **The Signal**: the useful takeaway explaining why it matters. The existing list and compact reading modes share ranked, source-diversified stories with the daily email.

## Development

```sh
npm ci
npm run dev
```

Open http://localhost:3000. `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` are the release checks. Tests use fake transports and never send email. `npm run start` serves the production build. Production-only email and AI credentials are not required for UI development.

## Configuration

Keep `.env.local`, Vercel credentials, and provider keys out of Git. Configure production values in Vercel:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public read-only story access, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database access |
| `OPENAI_API_KEY` | Server-only enrichment |
| `OPENAI_MODEL` | Optional override; default `gpt-6-luna` |
| `PIPELINE_SECRET`, `CRON_SECRET` | Manual automation / Vercel cron authorization |
| `RESEND_API_KEY`, `DAILY_SIGNAL_FROM` | Server-only verified email transport; displayed sender name is Signal Brief |
| `DAILY_SIGNAL_RECIPIENT` | Private owner copy and reader submission notification address |
| `DAILY_SIGNAL_UNSUBSCRIBE_SECRET` | Stable secret of at least 32 characters for signed unsubscribe links |
| `DAILY_SIGNAL_ENABLED` | `true` enables scheduled email; false/unset disables scheduled sending |

Never use a `NEXT_PUBLIC_` variable for the owner address or service credentials. Reply-To is not separately configured; replies use the verified From address. Keep the unsubscribe signing secret stable so existing links continue working.

## Database

For a fresh project, apply `supabase/schema.sql`, then **`supabase/launch-readiness.sql`**. For the existing production project, the launch migration is additive and preserves subscribers and stories. It was applied on October 2, 2026. `daily-signal-public-launch.sql` is the historical subscriber rollout, not the final security configuration.

- `stories`: anonymous SELECT for published rows only; no public writes.
- `daily_signal_subscribers`: private pending/active/unsubscribed lifecycle, hashed confirmation tokens, confirmation timestamps, and allowlisted campaign attribution.
- `daily_signal_sends`, `daily_signal_deliveries`: private campaign snapshots and per-recipient send claims.
- `reader_submissions`: private, durable feature/source feedback with notification status.
- `public_request_limits`: private expiring HMAC identifiers and atomic request counters.
- `pipeline_runs`: private run locks, status, counts, and timing. Thirty-day retention.

All new functions revoke public/anon/authenticated execution and grant service-role execution only. Run `supabase/launch-readiness-checks.sql` **inside a transaction that rolls back**; it exercises confirmation, expiry, resubscription, rate limits, and permissions using disposable fixtures. Do not run it as an autocommitting production script.

## Content pipeline

Vercel calls `/api/run-pipeline` every six hours at 00:00, 06:00, 12:00, and 18:00 UTC. The route accepts Vercel `Authorization: Bearer $CRON_SECRET` or manual `PIPELINE_SECRET` authorization.

1. Fetch the 12 RSS sources in `lib/feeds.ts` and reject malformed, future, or stale records.
2. Skip unchanged stored URLs before paid AI calls, retaining existing IDs.
3. Retrieve article evidence with bounded timeouts, size limits, publisher host checks, and five-way concurrency. Remove navigation/forms and find actual article bodies; otherwise use the RSS evidence.
4. Generate structured summary, Signal, category, and score with GPT-6 Luna, three-way concurrency, 20-second requests, and at most two attempts. Source text is untrusted evidence, not instructions. Invalid outputs do not publish fallback copy.
5. Upsert, retain published stories for 72 hours, and cap each source at six stories. Rank/diversify consistently across the feed and email. Conservative URL/event/roundup deduplication hides repeats without deleting stored records.

A private database claim prevents overlapping runs. All-source or all-generation failures report errors. Per-source failures and enrichment counts appear in run metrics. Pending feedback notifications are retried after ingestion. The route has a five-minute execution limit; abandoned claims recover after six minutes.

The homepage caches successful database reads for 60 seconds and displays a distinct unavailable state on database failure. AI is only called during ingestion or explicit evaluations, never per visitor. The text-only presentation is intentional.

Local `npm run ingest` and `npm run enrich` scripts are operational tools: enrichment makes paid calls and writes to the configured Supabase project. `npm run model-eval` makes paid comparisons and saves ignored local results without writing stories. Review the configured destinations before running these tools.

## Subscriber lifecycle and forms

Signup validates email, same-origin JSON, payload size, honeypot, and durable IP/address limits. It creates a pending record and sends a 24-hour confirmation link. Only an explicit confirmation POST activates a subscription; link-scanner GET requests cannot subscribe anyone. Repeated pending requests have a five-minute cooldown, and active addresses receive the same generic public response without another email. Existing active subscribers stay active.

Confirmation stores only token hashes. Unsubscribing clears pending confirmation state. Subscribers can sign up again, but must reconfirm. Signed unsubscribe links remain account-free and repeat-safe; mailbox providers can use RFC 8058 one-click POST headers. Token pages have no analytics, no indexing, and no referrer disclosure.

Source suggestions and feature requests are stored before owner notification. Identical submissions within a ten-minute bucket are deduplicated. Provider failures leave a private pending row; ingestion retries recent notifications within Resend's idempotency window. Inspect older unnotified rows manually rather than blindly resending after 24 hours.

## Daily email operation

The email uses the lead, three Worth Knowing stories, and up to six On the Radar items. The lead must be within 24 hours, all stories within 72 hours, and four valid stories must be available. Missing or stale inventory returns 503 without claiming or sending an incomplete issue.

Vercel calls `/api/daily-signal` at **12:10, 12:30, 13:10, and 13:30 UTC**. An `America/New_York` gate allows only 8:10–8:39 AM local time: 8:10 is the normal delivery and 8:30 is recovery, across DST. The existing 8:10 timing remains intentional, after the 12:00 UTC ingestion run in daylight time.

The first attempt saves the entire selected issue. Retries reuse it, skip recorded deliveries, and keep provider request keys stable. Changed payloads and ambiguous attempts outside the provider idempotency window are not automatically resent. Emails are sent one recipient at a time with bounded requests and pacing. No recipient list is exposed in To or CC. Large lists can exceed the five-minute function budget; inspect partial campaign counts and plan a queue before scaling to thousands of subscribers.

**Manual POST `/api/daily-signal` sends a real campaign to all eligible recipients, even when scheduled sending is disabled. It is not a single-recipient test endpoint.** Do not use it for smoke tests.

For a no-send HTML preview, use `/api/daily-signal/preview` in development; it returns 404 in production. Render fixtures directly through `lib/email/render.ts` for production-build visual tests. The owner copy intentionally has no unsubscribe link.

## Launch measurement and privacy

GA4 (`G-Z489P9ZBC1`) loads only on the production homepage and respects Do Not Track. It records page views, 30-second visible engagement, signup started/submitted, source and feature requests, outbound story clicks, and list/compact changes. Analytics location/referrer values are sanitized; emails and bearer tokens are never event properties.

Allowlisted UTM labels persist for the browser session and are saved on pending subscriber records. Confirmed conversions are available by `confirmed_at` and `attribution` in the private database; no analytics script runs on confirmation links. In GA4, review event arrival and mark `signup_submitted` as a key event. Evaluate confirmed subscriber counts alongside submissions, which also include repeat addresses. Do not export subscriber addresses to ad platforms.

The public privacy page describes these services and links to the feedback form. Production pages provide canonical/social metadata; confirmation, unsubscribe, and 404 states are excluded from indexing. Security headers cover framing, MIME sniffing, referrers, and unneeded device permissions.

## Deployment and incident checks

GitHub `main` deploys to Vercel production. Always confirm the deployment's SHA and READY status, inspect build logs, and smoke-test the production alias after pushing.

For a failed run, inspect Vercel function logs and private `pipeline_runs` / campaign delivery counts. Test unauthorized automation calls, malformed public submissions, and public RLS without triggering a campaign. Provider dashboards are still needed to verify actual inbox receipt, suppression, domain reputation, and GA event arrival. Do not print secrets or subscriber addresses in logs or incident reports.

See `docs/launch-work.md` for the October 2026 audit evidence, validation, and release limitations.
