# Telegram Chat Actions QA — Prompt №10

Local verification,2026-11-01 Europe/Warsaw. [Technical plan, capability matrix, API/reuse, security, costs, migration and rollback](../../plans/telegram-chat-actions.md). [Exact stage file manifest](changed-files.txt). [Command evidence](verification.txt). [Browser report](browser-report.json).

No production/staging migration, real Telegram send/upload/voice, paid AI call, Instagram Direct or Support runtime was executed. Tests use mocked adapters/fixture media; browser APIs were intercepted. Official Telegram documentation was read publicly. Existing uncommitted changes were preserved against the stage's before-hash manifest.

## Quality gates

| Gate | Result |
| --- | --- |
| Focused API integration |23 suites /212 tests passed |
| Focused web integration |10 files /80 tests passed |
| Independent Turing review |14 API suites /130 tests and2 web files /35 tests passed; overlapping subsets, not additional unique totals |
| Prisma validate / generate |Passed; additive migration not applied; unrelated SetNull warning retained |
| Shared typecheck / build |Passed |
| API typecheck / build |Exactly five inherited errors in System Bot branding49/56/57 and Telegram Accounts855/877 |
| Web typecheck / production build |Passed |
| Scoped API/web lint |Passed; no added scoped lint debt |
| Architecture |16/16 policy tests;22 normal /28 strict inherited violations, baseline counts unchanged, no increased allowance |
| Browser mock QA |18/18 checks, six widths,13 screenshots, zero page errors |
| Whitespace / diff |Passed |

Full API execution was attempted:15 failing files were reported before existing development-connection-drain test code called `process.exit(0)` without a final Jest total. The process exit is not a full-suite pass. A broader CRM regression also includes pre-existing failures in unchanged dialog-batch-writer fixtures (missing settings mock) and unchanged contact-sales-summary expectations. Those unrelated production/tests were not repaired in this stage. Exact final broad totals are recorded in verification.txt.

Repository-wide web tests/lint were not repeated after the focused gate: previous stage documented substantial unrelated failures. Current web typecheck/build and all touched chat/regression tests pass; this report makes no clean repository-wide lint/test/release claim.

The root integrator visually inspected320px thread and1440px edit screenshots. Turing reviewed runtime/receipt/mapping/UI integration and found no unresolved known production P1/P2 after fixes. Mocks cannot establish live provider behavior, real PostgreSQL race behavior or measured production resource costs.

## Browser evidence

The current report has18 passing scenarios. Widths:320/360/390/768/1024/1440px. No feature idle writes, provider/Telegram sends or eager media download were observed. Existing app-shell traffic is outside this feature; the harness intercepts application API calls. No real customer is contacted.

- [Thread320](screenshots/thread-320.png), [360](screenshots/thread-360.png), [390](screenshots/thread-390.png)
- [Thread768](screenshots/thread-768.png), [1024](screenshots/thread-1024.png), [1440](screenshots/thread-1440.png)
- [Reply desktop](screenshots/reply-1440.png), [Edit desktop](screenshots/edit-1440.png), [Media desktop](screenshots/media-1440.png)
- [Delete confirmation mobile](screenshots/delete-320.png), [Attachment preview mobile](screenshots/attachment-390.png)
- [Short keyboard viewport](screenshots/keyboard-390.png), [Explicit voice fallback](screenshots/voice-fallback-390.png)

The keyboard screenshot uses a short simulated browser viewport and settled composer bounds. It does not prove a physical iPhone's keyboard, microphone, file picker or PWA behavior. Real-device acceptance remains below. The browser was closed; the existing localhost server was reused and left untouched. No task-owned dev server was started.

## Regression coverage

- Real same-conversation/account reply ID, deleted/foreign/unavailable original, quoted preview/cancel/jump and stable text receipt identity including reply/actor/AI revision.
- Own versus foreign edit, native restrictions, safe formatting/Unicode UTF-16, literal plaintext versus legacy markup, same-second reversed edit events and complete empty metadata snapshots.
- Confirmed delete-for-me/everyone, unknown revoke, account tombstone before local original, deletion before manual HTTP persistence, late edit/history, body removal and latest preview.
- Authoritative unread after deleting imported rows, queued newer messages, remote watermark, older read boundary/PTS rejection and unchanged-state no-op writes.
- Add/remove reactions using provider counts, stale hints coalesced through targeted current-message read, no fake counts, no notification/unread work on edit/reaction.
- Current source/destination permissions, same account, protected forward, DNC and AI-attributed edit/forward exclusion; fresh-key UNKNOWN forward/media claims remain blocked after remount.
- Upload size/MIME/signatures, unsafe name, bounded transfer/download, unavailable/wrong-account media, lazy authorized media rendering and object URL lifecycle.
- Actual small Ogg/Opus fixture, voice duration/container validation, permission denial, cancellation during pending permission and explicit browser audio-file fallback. No runtime transcoding.
- Workspace/read/edit-own/any isolation, current account/session/DNC rechecks after session wait, actor/request receipt conflicts, DB/provider partial failures and read-only status reconciliation.
- Deleted notification group retirement and delivery-time batch check: remaining unread cannot authorize a deleted preview.
- Test-only Support adapter with different capabilities; no CRM business imports into generic chat presentation, no new history polling or per-row media joins.

## Manual staging acceptance

1. Resolve global API build blockers, review/apply additive `20261101130000_telegram_chat_actions` only to staging and deploy shared/API/web together. Verify receipt unique/partial/FK indexes and message/account numeric index. Begin with both rollout flagsfalse; ordinary manual text must still work.
2. Enable actions only for consenting test accounts/peers using existing CRM Send/session controls. Test view-only, own-only, any roles, another workspace/account, ownership change while session waits, disconnected/revoked session and DNC. No transport mutation may occur after denial.
3. Reply to an actual test message and inspect Telegram's real reply linkage. Cancel reply, switch client and check draft isolation. Remove the original before Send and expect explicit unavailable. Retry a lost HTTP response with the retained key; changing target under that key must conflict.
4. Edit own formatted text with emoji/surrogates, nested supported entities, links/spoiler/code/pre/blockquote. Preserve ordinary composer draft. Try another author's message, native expired/unsupported edit, AI-attributed source and unchanged text. Reversed/same-second updates must reconcile current content.
5. Confirm delete-for-me and delete-for-everyone separately. Simulate timeout: absence alone must never claim successful revoke for everyone. Exercise delete-before-new, delete-before-HTTP-persist, delayed edit/history and a reply referencing deleted original. Inspect unread/latest preview and absence of body/media URLs.
6. Delete an imported unread row and a live unread row with another unread remaining. Deliver older PTS/read snapshots after newer ones and queue new incoming messages during the read. Verify no lost/doubled unread and no queued deleted-message notification preview. Already delivered external push is not retractable.
7. Add/remove permitted reactions, test native restricted/premium/custom emoji failure, reconnect and reversed unversioned hints. Counts must match Telegram and edit/reaction must not create new incoming push or advance sales dates.
8. Forward through the same-account paginated destination picker; verify native forward attribution/protected-content denial and current destination DNC/scope. Lose the HTTP response, unmount/remount/switch back and attempt the same pending source with a new key: no second provider mutation. Unknown outcomes require operator investigation.
9. Upload consenting fixture image/document, inspect preview then explicit Send. Test10MiB boundary, oversize, mismatched MIME, unsafe name and unsupported type. Admit at most two transfers/process; cancel before/after dispatch and test connection loss/DB-after-provider success. Never interpret browser abort as proven remote cancellation.
10. Open images/files/audio explicitly and verify authenticated same-account download, deleted/unavailable response, safe attachment headers and no fetching at Inbox/list/bubble mount. Test unusual image dimensions/memory separately;10MiB byte cap is not a measured decoded-pixel limit.
11. On actual iOS/Android/PWA test safe areas, virtual keyboard, file picker, microphone allow/deny/cancel and navigation/focus restoration. Native Ogg/Opus recording must be playable as Telegram voice. Otherwise explicitly choose supported audio-file fallback; no silent voice relabel or FFmpeg service.
12. Test approved Copilot text and stale revision/context with/without reply. Verify exact server guard/DNC and no accidental Send. Media captions must not smuggle an approved AI draft into an unguarded route.
13. Check SSE disconnect/reconnect, same message identity, narrow cache updates and rapid client/workspace switches. Delete's returned IDs tombstone immediately; exact list head refresh reconciles derived preview without resetting loaded history. No full-history reload after reaction/edit.
14. Run existing daily cleanup: resolved non-TEXT receipts older30 days delete in bounded20k batch; UNKNOWN/TEXT survive. Remove a disposable account/workspace and verify cascade cleanup of receipts/deletion identities. Never erase an unresolved receipt merely to enable resend.
15. Measure actual SQL plans, transaction contention, memory/CPU/latency and upload/download egress under100/1,000/10,000 actions/day. Watch pending receipt growth, retention lag and 100-account behavior. Rollback disables flags and retains additive safety data. Do not publish a final release based solely on mock QA.

## Runtime limits

No new worker, cron, permanent connection, presence write, history polling, eager media load, AI attachment processing or media blob storage was introduced. Existing daily cleanup adds one bounded receipt query; idle100 stored accounts/channels add no recurring work from this feature. Two10MiB downloads can transiently hold roughly40MiB payload during concatenation plus unmeasured SDK/HTTP overhead. Detailed source-level DB/call/egress scenarios and the limits of these estimates are in the plan.

Private-peer scope,10MiB media cap, curated reaction picker, optional native voice support, uncertain outbound operator review, unknown-local deletion reconciliation and cross-instance/live-device limitations remain explicit. The default-disabled feature flags and five baseline API errors prevent claiming a ready final production release.
