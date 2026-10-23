# Source processing exclusions, 2026-10-23

Operational change authorized by Jonny: remove sources whose terms conflict with Signal's processing and find replacements. This is not a legal opinion or a blanket determination that all other sources are licensed.

## Excluded from new processing

- The Verge: current publisher footer links PMC. PMC terms, updated August 21, 2026, section 9 restrict automated extraction and AI grounding; section 19's RSS permission does not authorize this transformation. https://www.pmc.com/terms-of-use
- WIRED and Ars Technica: current publisher footers link Condé Nast. Official indexed user-agreement text restricts AI grounding, RAG and operation. Direct agreement retrieval returned 403 during review; this access limitation is retained, not presented as a full-page review. https://www.condenast.com/user-agreement

Names and publisher domains are excluded centrally, covering ingestion, article hydration, existing-record changes, direct enrichment helpers, persistence and future email selection. Domain matching is exact or subdomain, never substring. Unresolved terms for other sources are not treated as proven prohibitions.

Existing published stories remain visible and are not deleted by this change. Their background article-access fetch is skipped. Normal, pre-existing retention rules are unchanged. Already-sent messages and send history are unchanged.

## Same-day email recovery

A saved issue containing an excluded source stops before claim, transport or history writes. It is not rewritten because a partially sent issue must preserve recipient idempotency and content hashes. This only affects recovery of that dated issue. The next date selects fresh eligible inventory. Never call the live campaign endpoint to test this behavior.

## Replacement status

EFF (https://www.eff.org/rss/updates.xml) and Global Voices Technology (https://globalvoices.org/-/topics/technology/feed/) have fresh feeds and documented attribution licences for eligible original content, subject to exceptions. They are not activated by this patch. Their required author/original URL/licence/adaptation disclosures must survive storage and appear on both web and email. Current story storage has no dedicated attribution fields. Third-party content and unverified exceptions must be quarantined rather than blindly accepted.

Source evidence: https://www.eff.org/copyright and https://globalvoices.org/about/global-voices-attribution-policy/. Global Voices is CC BY 3.0; EFF's original content is CC BY 4.0 unless otherwise noted. This is not image clearance. No images are introduced.

## Verification

Fixture-only unit tests cover name/domain exclusion, lookalike hosts, retained unresolved sources, no network/AI for excluded content, no excluded persistence, future email filtering, and saved-issue fail-closed handling. No paid AI calls, live ingestion, or actual email sends are used for QA.
