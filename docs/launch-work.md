# Signal Brief launch work — 2026-10-02

Baseline: production `main` at f5cdd17448c82dba440f5f73172cdd110ab36538, fetched and fast-forwarded from a clean checkout. Vercel deployment dpl_E3xyVSnvPVdL1tVh6CTC9U6mNwHk was READY at that SHA.

## System map

Next.js App Router renders the homepage on the server from published Supabase stories. React handles category filters, view/theme, auto-scroll, and forms. RSS sources run every six hours through an authenticated Vercel route, normalize metadata, skip unchanged rows, retrieve source text, generate structured GPT-6 Luna editorial fields, and upsert stories. Ranking and source diversity are shared by the site and daily email. Retention is 72 hours with six published stories per source; an existing database cleanup also runs daily.

Resend sends individual emails to active subscribers and the configured owner. Campaign and recipient claims provide duplicate protection. Daily cron uses both 12:10 and 13:10 UTC and an America/New_York gate for 8:10 AM across DST. No user accounts. Google Analytics GA4 provides page measurement. Private server environment settings contain subscriber, owner, provider, and cron credentials.

## Baseline evidence

- 57 existing tests passed; lint found an empty catch in source retrieval.
- 45 published stories from 12 sources; newest ingestion updated 18:01 UTC on October 2. The latest seven campaigns were recorded sent. Two active subscribers and one suppressed record (no addresses retained here).
- Subscriber and recipient delivery tables reject anonymous reads. Campaign rows were RLS-hidden.
- Text-only cards/email are intentional; all current image fields are empty and no broken images appear.
- Signup immediately activates addresses; no confirmation lifecycle. Feedback routes email submissions directly and have no rate limits or durable storage. Feedback UI throws after success by accessing an expired event.currentTarget, and misses network errors.
- GA loads on token-bearing unsubscribe pages; no explicit conversion or interaction events.
- Feed includes duplicate newsletter roundups, thin-source Signals, and no presentation-level deduplication. Some categories are debatable (a biological-aging contest labeled AI).
- Unbounded AI timeouts and sequential enrichment can exceed serverless execution time. No pipeline failure when every source/AI call fails.
- Email can select stale lead stories and send an incomplete issue. A provider-accepted/database-write-failed recipient can be marked failed and later resent with changed content.
- Registry audit: 12 advisories, including critical Next.js; updated within major versions to patched releases and audit now reports zero.

Validation, deployment evidence, and residual limits will be recorded after implementation.

## Implemented changes

- Patched Next.js and tooling; removed the unused Resend SDK after adopting bounded provider requests. Added request timeouts, redacted public errors, security headers, and safe URL validation.
- Reconciled production schema drift: published-only story reads and private campaign data. Added durable rate limiting, private feedback storage, run history/locking, and confirmation lifecycle. The additive migration passed transaction/rollback checks and was applied successfully.
- Signup now sends a confirmation email, activates only after an explicit POST, expires tokens after 24 hours, suppresses repeat mail, and requires reconfirmation after unsubscribe. Existing active subscribers were preserved. Removed the unused direct-activation helper.
- Feedback is stored before notification, deduplicated, rate-limited, and retried independently of the browser. Corrected the success handler, loading/error states, URL validation, and mobile input size.
- Removed analytics from token pages, added safe campaign attribution and launch events, and provided a privacy page. Confirmed conversion measurement remains in private database timestamps rather than GA on bearer-link pages.
- Fixed publisher article extraction that previously consumed navigation/signup text. Improved grounded editorial prompts, conservative feed deduplication, URL/timestamp validation, bounded AI concurrency/timeouts, and durable pipeline failure tracking.
- Eight approved live GPT-6 Luna evaluations all passed validation on the first attempt: 13,999 input tokens, 680 output tokens, mean request latency 2.84 seconds. Sample covered agents, enterprise AI, a product rumor, political reporting, creator economics, neurotechnology, and legal reporting. Reviewed against actual source bodies. Corrected three existing New Stack summaries/Signals, preserving story IDs and scores; two Signals received manual wording adjustments to keep costs/timeframes and test findings precise. Original values saved in the ignored local rollback artifact.
- Daily email refuses stale/incomplete issues, saves its selected issue, retries the identical payload, paces recipient sends, and supports mailbox one-click unsubscribe. Added 8:30 AM Eastern recovery while preserving normal 8:10 delivery and DST handling.
- Preserved the established editorial layout, text-only cards/email, ranking/source rules, full Compact Signals, and existing public URLs. Added a short explanation of The Signal, keyboard skip link, clear failure states, branded 404, and successful-read caching.

## Validation before deployment

- 70 automated tests pass. Coverage includes malformed/oversized/cross-origin submissions, email validation, token hashing, safe attribution, extraction/redirect restrictions, conservative deduplication, invalid/stale email inventory, bounded concurrency, AI/provider failures, signature tampering, DST, partial recipient failure, and immutable email recovery.
- SQL checks passed against production inside a rolled-back transaction: signup/duplicate/confirmation/expiry/resubscription, rate limits, and permissions. Migration then applied successfully without changing existing subscriber counts.
- Anonymous reads of six private tables return 401. Anonymous non-published story query returns no rows.
- Lint, TypeScript, and production build pass. Dependency audit: zero known vulnerabilities.
- Browser checks at 320, 390, 768, 1024, and 1440 px: no page overflow; complete Compact Signals; topic filters and theme switches work. Narrow signup validation and feedback form layout checked. Both email HTML templates inspected at phone widths; fixed missing UTF-8 metadata in confirmation email. No image dependency.
- HTTP checks: homepage/privacy/robots/sitemap/social image succeed; unknown page 404; token pages noindex/no-referrer; preview unavailable in production; protected automation unauthorized; invalid JSON/fields/URLs rejected. No bulk campaign was triggered.
- Baseline public network sample: response headers 1,562/652/576 ms; public JS compressed with gzip totals 193,560 bytes across 10 chunks. These are single-location request timings, not field Core Web Vitals.
- Public HTML/chunks contain none of the existing local server secret values, personal-mail-provider addresses, or mailto links. Owner contact configuration is only read in server modules; public form responses contain no notification recipient.

## Operational limits

Real Gmail/Outlook inbox placement, client dark-mode transformations, sender domain/reply handling, GA dashboard event arrival, and post-release scheduled execution require provider/dashboard or subsequent-run evidence. Browser email rendering and successful API acceptance do not prove inbox delivery. Production secret export was blocked by automatic approval review; no production environment secrets were downloaded. Tests use existing local access and public application routes instead.

The daily campaign remains a small-list serverless sender. The five-minute execution limit and provider quotas require a queue before a large subscriber rollout. Bounce/complaint suppression relies on Resend's provider controls; no new webhook infrastructure was added. Confirmed acquisition can be measured from private `confirmed_at` plus attribution; GA's `signup_submitted` includes repeat addresses and should not be treated as a confirmed subscription.
