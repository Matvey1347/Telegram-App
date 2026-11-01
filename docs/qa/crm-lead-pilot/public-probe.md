# Lead discovery: initial source access probe

Date: 2026-11-01. User supplied nine Telegram channel references for a first test, with a limit of 50 posts per source. One invitation is an AI-themed source, outside the main psychology niche; keep it as a distinct category when a real source is resolved. The five private invitation links are intentionally not copied into this report or logs.

This was a read-only public web access probe, not a run of the CRM discovery/AI pipeline:

| Supplied public channel | Visible dated posts read | Result |
| --- | ---: | --- |
| `ce_znack` | 50 | Three bounded public pages |
| `beinprogress` | 50 | Three bounded public pages |
| `WebPsychology` | 50 | Three bounded public pages |
| `psychology_uk` | 0 | Public preview redirected to a profile without accessible history |
| Five invitation links | Not read | Requires the user's already-authorized Telegram account to resolve access; no join was attempted |

A crude case-insensitive keyword check for advertising/sponsor/promocode language matched 0/50, 2/50 and 42/50 posts respectively. Manual spot checks show false positives: WebPsychology repeatedly includes the channel’s own advertising-sales contact in ordinary posts, and one beinprogress match refers to an advertising agency in editorial text. These are keyword matches, not identified advertisers or validated advertising counts. This probe does not establish that the channels contain no advertisements or quantify recall. The actual CRM classifier, contact extraction, paid AI cost, semantic quality, private sources and source-folder import were not tested.

At the time of the initial probe, the Lead Discovery source normalizer accepted public usernames or numeric channel IDs but rejected invitation URLs. Subscribed channels could instead be selected through the account channel catalog; catalog visibility is not processing approval. The observed UI said discovery was disabled, and the local unauthenticated config request returned HTTP 401. No authenticated session, current workspace identity, immutable IDs, approved grants or budget were obtained by that probe. No source rows or configuration were changed by the probe. Do not log or commit invite hashes.

To run the requested real pilot, use an explicitly identified non-production workspace/account with access to the subscribed sources, deployment-reviewed ingest grants matching immutable channel IDs, and an approved finite AI budget and processing grants before any paid classification. Limit scanning to 50 posts per selected source; preserve the separate AI-topic label. Compare predicted advertisements and literal contacts against a human-reviewed sample, including misses and uncertain cases. Never join channels or send outreach as part of this probe.

## Manual examples worth reviewing

These are the assistant's manual assessments of public posts, not CRM classifier results, and do not prove paid placement:

- https://t.me/ce_znack/8488 — promotes a discount-shopping channel; outside the central psychology niche.
- https://t.me/ce_znack/8463 — promotes subscription sales; outside the central psychology niche.
- https://t.me/WebPsychology/3827 — promotes online courses for children, including AI/programming; adjacent educational topic.
- https://t.me/WebPsychology/3798 — a psychologist promotes her psychology channel; highly relevant thematically, but the destination or listed profile is not automatically verified as an advertising sales contact.

The sample is illustrative, not an exhaustive human-labelled set. Post text and invite hashes are not retained in this report. Human review must distinguish advertised projects from a source channel's own advertising manager and avoid inferring a person's identity or consent to outreach.

A read-only metadata query found an active, connected `tgManage770` account in workspace `Business`. No AI workspace config or category configs for `LEAD_AD_CLASSIFICATION` and `LEAD_CONTACT_EXTRACTION` were found there at the time of the query. The configured database target is remote; no writes or live Telegram calls were performed by this probe. The active browser's authenticated application session is not available to this tool session.

## Follow-up on 2026-11-01

The four public references listed above were added idempotently to the Business workspace's Lead Discovery source registry. The database now contains `ce_znack`, `beinprogress`, `WebPsychology`, and `psychology_uk` as paused, unverified sources. No account or immutable Telegram channel ID was assigned without checking access through an existing live account. The five private invitation references remain unavailable from this record and were not reconstructed or inserted. No scan, AI analysis, join, or outbound message was run. The Lead Discovery page now opens on Sources so these registry rows are visible immediately. Processing still requires per-source technical validation and matching grants.

The user subsequently resupplied all nine references. Five private sources were registered in Business without duplicating the four public sources. Eight source labels identify psychology; the remaining private source is labelled `ИИ · вне основной тематики`. Private URLs are stored only in the workspace source registry; source identity keys use a SHA-256 digest, and raw invitation links are omitted from this report. All nine remain paused pending live account validation. The normalizer now accepts exact Telegram invite URLs and canonicalizes equivalent `+`/`joinchat` forms. Validation uses read-only `CheckChatInvite` and requires existing membership; it never imports an invite or joins a channel. Validation preserves the user-owned source title and private URL, including its topic label. No Telegram collection or paid AI request was performed during registration.

This follow-up adds no worker, polling, timer, unchanged-state write or append-only storage. Paused sources perform no idle DB/Telegram work and do not add Neon wakeups or a Railway connection/RAM baseline. One explicitly requested successful private validation uses two Telegram RPCs (`CheckChatInvite`, `GetFullChannel`) and at most one changed metadata write; 100 individually requested validations therefore use up to 200 RPCs. Unjoined sources stop after the first RPC. URLs live in the existing workspace source rows under their existing lifecycle, with no additional history or retention table. Manual QA: Business → Lead Discovery → Sources should show nine references, eight psychology labels and one AI label; validating an already joined private channel must retain its custom title, while an unjoined invite must fail without joining.
