# Finance assistant latency audit (2026-10-28)

## Measured baseline and limits

No authenticated Finance staging session, provider test key, or representative database was available in this workspace. Therefore time to first answer, model duration, tool duration, full latency p50/p95, frontend network delay, and actual request cost **cannot be reported as measured values**. Unit-test elapsed times are not a production benchmark. Do not use a performance claim until the opt-in probe below has been run on the same dataset before and after a change.

The existing `FinanceAiUsage` table records per-call model, token counts, estimated cost and one aggregate `latencyMs`, but no request-level join or frontend timing. Its `estimatedCostMicros` is based on the repository's dated price table, not a provider invoice. A read-only baseline for existing events can be obtained with:

```sql
SELECT feature, model, status, count(*) AS calls,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs") AS p50_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95_ms,
       sum("estimatedCostMicros") AS estimated_cost_micros
FROM "FinanceAiUsage"
WHERE "createdAt" >= now() - interval '7 days'
GROUP BY feature, model, status;
```

These are **AI usage event** figures, not complete Web/Telegram request latency. They must be read from the appropriate environment without exporting user prompts or credentials.

## Source-path audit

| Path | Backend context | AI/API calls before changes | Observed risk |
| --- | --- | --- | --- |
| Plain expense/income note | Profile, account names, credential, entitlement, proposal | One Responses call | Extractor is the short path; no benchmark yet. |
| Other assistant message | Entitlement, profile, analytics (eight aggregate queries), accounts, 40 recent entries, credential | One Responses call; a router failure could trigger a second extraction call | Context is loaded before the model even for guidance and clarification. |
| Voice | Telegram file fetch/download or Web upload, transcription, then text extraction | Two sequential AI calls | Added network and model latency. |
| Two to five receipts | Original-resolution images in one request | One Responses call | Validation incorrectly required exactly one result and rejected valid batches. |
| Standalone Finance | No AI API or Telegram message dispatch; Web uses local demo parser | Zero real AI calls | Not a working assistant. |

The provider uses a 25-second deadline and retries transient errors up to twice. The Web endpoint sends an immediate NDJSON `start` event, then progress, text deltas where available, and a final result. There is no idle polling or background AI work. At 100 channels, idle AI load remains zero; active cost scales with user requests and receipt image bytes. `FinanceAiUsage` is append-only and needs a retention decision before high-volume rollout.

## Changes and repeatable probe

Router errors no longer start a hidden second model request. Two to five receipts now accept exactly one parsed operation per image. The streamed route now emits numeric timing data for context preparation, model call, first model text delta, proposal creation and total server time. The fast extraction path reports total time and leaves unavailable stage timings `null`; it does not pretend to measure stages it cannot separate.
Question-shaped messages with an amount now stay on the conversational route instead of being mistaken for a new expense proposal.

Run the opt-in probe with a disposable staging Finance consumer session and the same question prompt/data on the baseline and updated environments:

```sh
FINANCE_AI_BENCH_URL=https://<api-host> \
FINANCE_AI_BENCH_BOT_ID=<bot-id> \
FINANCE_AI_BENCH_COOKIE='finance_consumer_session=<session>' \
FINANCE_AI_BENCH_PROMPT='What changed in my finances this month?' \
FINANCE_AI_BENCH_SAMPLES=20 \
node apps/api/scripts/finance-ai-benchmark.mjs
```

The script reports p50/p95 for headers, first event, first text delta, context, model, proposal and total client-observed time. Each request records AI usage, consumes quota and can incur provider cost. A model may also create an expiring draft proposal even for a question; the script never confirms it into the ledger. Use a disposable staging profile and apply the normal proposal/usage retention policy after probing. Test a short expense prompt separately to cover the fast path. Compare `FinanceAiUsage` token and estimated-cost aggregates for matching windows. Run Web browser Performance traces for rendering delay after each stream event; the CLI cannot measure React commit time. No such benchmark was executed here.

## Remaining work

- Bring the independent Finance API and Telegram webhook from Task 1 to feature parity before moving AI into that host. Its ledger currently supports only basic accounts and income/expense creation; it does not yet own transfers, categories, budgets, goals or recurring-payment use cases.
- For richer AI actions, call the already authorized Finance domain services and keep review/confirmation for writes. Do not give the model database access or copy financial rules into prompts or UI.
- Capture representative 0, 1,000 and 10,000 transaction profiles in staging to isolate context query time from provider time. Track actual provider invoice cost and update the dated price table.
- Decide whether to avoid the eight analytics aggregates for guidance/clarification after measuring accuracy and latency. Keep the existing one-call route until evidence supports an extra classification call or model fallback.
