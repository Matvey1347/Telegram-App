# P3: single-source staging acceptance

Status: BLOCKED on a separately authorized test Telegram account/channel and an allowed staging browser. No real Telegram post was observed in this run; no filter distribution or candidate count for a real source is available. No paid AI or production service was used.

## Local preparation performed

- Disposable local PostgreSQL 17; clean database migrated with `pnpm --filter api run db:deploy:safe`. The safe workflow reported successful deployment and schema verification; `prisma migrate status` reported 206 migrations current. Repeating the safe deploy found no pending migrations and verified the schema again.
- One local API instance launched in a clean environment, against the disposable database, with `INTERNAL_LEAD_DISCOVERY_ENABLED=true`, `INTERNAL_AI_ENABLED=false`, and an empty grants array. No Telegram session, API ID/hash, bot token or provider credentials were supplied.
- A synthetic staging user registered through the actual auth API; registration, `/auth/me`, Lead Discovery config, accounts and sources read endpoints returned success. One workspace existed, with zero Telegram accounts and sources. The API returned a healthy response after a process restart. Restart recovery of source work was not tested because no authorized source exists.
- An isolated copy of web was started with webpack on another local port and its root returned HTTP 200. This is an HTTP availability check, not browser QA. A previous computer-use session was forbidden; it was not reopened or circumvented.
- Database counts at inspection: zero observations, queue rows, candidates and AI operations. These are empty-environment counts, not measurements of a real Telegram source. No provider credentials were present and no AI operation was attempted.

## Input needed

Provide a location for an already provisioned non-production Telegram account/session and an explicitly permitted test channel, or a dedicated staging configuration and permitted browser environment. Do not paste keys, session strings, passwords or access tokens into chat. The workspace and account must be separate from production. A real publication with the required characteristics must actually exist for each classification or metadata scenario; report absent examples as not exercised.

## Manual acceptance in an allowed staging browser

1. In the isolated environment, confirm the target database and application are staging. Configure a single API instance with `INTERNAL_LEAD_DISCOVERY_ENABLED=true` and `INTERNAL_AI_ENABLED=false`, with no paid AI credentials. Connect the dedicated test Telegram account. Create/select the test workspace and the explicitly permitted source, and validate access.
2. Configure one short-lived `INTERNAL_LEAD_DISCOVERY_GRANTS` JSON entry matching that workspace, source normalized key, account, canonical channel ID and policy/consent processing reference. Set `ingest` and `ai` permissions as authorized for that source. The `ai` grant is also required by the current automatic routing and deterministic candidate path even while the global AI gateway is disabled; it does not itself enable the provider. Check the actual settings before starting.
3. Open the source and start the 90-day action. Manually refresh progress. Record collection and analysis counters independently, including waiting, running, completed, metadata, failed, unknown and admitted AI operations. With AI disabled, items needing AI must not be counted as successful AI analysis; record their actual statuses and errors.
4. Inspect several actual saved posts against their Telegram originals: source/message links, visible text, entity and TextUrl evidence, inline buttons and forward metadata. Record which structures really occurred in the source; do not infer examples from absent data. Count actual prefilter decisions and deterministic candidates and open their publication/evidence/contact in the interface.
5. Send a new post only in a dedicated test channel where that action is authorized, or wait for an existing authorized post; verify arrival and queue processing without a second start. Check pause while analysis remains active after history finishes, resume, then restart the staging API and verify queue recovery. Do not assume the restart health check above validates this.
6. Confirm the count of AI operations is zero and inspect logs/receipts for attempted AI-disabled operations; confirm no automatic outbound Telegram messages or unrelated CRM changes. Record errors, authorization failures and manual-review states.

The pause contract permits operations admitted before pause to be sent or completed after its response. With the gateway disabled, no paid dispatch is permitted; do not enable it for this stage. Environment-based grant changes must be applied to every relevant instance.
