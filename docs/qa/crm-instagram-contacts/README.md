# Instagram manual CRM QA — Prompt №9

Local work,2026-11-01 Europe/Warsaw. [Implementation, contracts, costs, migrations, official-adapter plan and rollback](../../plans/crm-instagram-contacts.md). [Exact file manifest](changed-files.txt). [Command evidence](verification.txt).

No production migration, Instagram authorization/profile lookup/DM, paid AI call or final release was performed. Tests use mocks. Browser application APIs were intercepted. Documentation research fetched public official Meta documentation only.

## Results

| Gate | Result |
| --- | --- |
| Focused API integration | 36 suites /447 tests passed |
| Focused frontend CRM | 29 files /220 tests passed, including18 manual workflow tests |
| Prisma validate / generate | Passed; migration not applied; existing unrelated SetNull warning remains |
| Shared typecheck / build | Passed |
| API typecheck / build | Exactly five inherited errors: System Bot branding49/56/57; Telegram Accounts855/877 |
| Web typecheck / production build | Passed |
| New/feature API and frontend scoped lint | Passed; existing Sales facade lint debt reported separately |
| i18n | Passed |
| Architecture | Policy16/16;22 normal /28 strict inherited violations, unchanged count; no raised allowance |
| Whitespace / git diff | Passed |
| Browser |17 checks,6 widths,19 screenshots; zero feature idle writes, console errors, provider/Instagram/send calls |

Full web snapshot:354 passed/96 failed files,1,785 passed/31 failed tests. The stage№8 baseline was354 passed/95 failed files and1,764 passed/30 failed tests. The additional failing MutualPromotionPostImport test is outside this stage's files and passes isolated5/5; it was not hidden or patched. All touched CRM/Instagram regressions pass. Full web lint remains142 errors/168 warnings.

The full API suite was attempted. It reported15 failing files outside this stage and then existing development-connection-drain test code called `process.exit(0)` before a Jest total. The zero process exit is not full-suite success. Focused results are the reliable scoped evidence.

Lint of all changed API paths includes the pre-existing Sales facade debt:575 errors/84 warnings in `telegram-ad-sales.service.ts`. The extracted helpers, Instagram/manual code and tests pass scoped lint. The facade shrank from5,746 to5,707 lines; its unrelated pricing/type debt was preserved. Contact read/command legacy files were not expanded and no architecture threshold was increased.

Grace mapped reuse; Parnas/Knuth preflight established the baseline; Turing read-only review checked endpoints, legacy typed writes, identity, DNC, merge, task receipts, notifications and UI. Its independent checks passed8 suites/60 tests plus3 suites/14 targeted follow-ons (overlapping subsets), with no unresolved production P1/P2 in the inspected implementation. The main integrator then fixed and tested equal-date Waiting filter consistency and no-op compact writes for older reports, and ran the final447-test integration gate.

## Regression coverage

- Username/@/HTTPS URL normalization, raw input preservation, canonical safe URL and no existence claim; invalid scheme/host/credentials/ports/encoded/dot-segment/content/Direct paths and near-name differences.
- Typed identity add, explicit legacy promotion, profile rename clearing ownership, reconfirmation/stale state, conflict without name-based merge, generic legacy write normalization/UNVERIFIED and accidental Telegram-method conversion rejection.
- Instagram-only and combined Telegram/Instagram clients; human-confirmed current literal IG candidate identity, no automatic pre-review IG identity merge, canonical existing-client attachment and preserved source evidence.
- Workspace and own/any read/edit intersection, other actor/request conflicts, DNC/CLOSED/archive, reported inbound reply without DNC reset and client merges with monotonic manual facts.
- Manual report receipt replay, changed payload, expired keys, future/older dates, unchanged status and unchanged compact timestamps; no Telegram inbound/outbound/unread/message writes.
- Approved candidate Copy, stale/expired/wrong-client/wrong-revision draft rejection, multiple confirmed IG profiles, manual offer attribution without provider SENT/delivery/read fabrication.
- Canonical follow-up creation/retry/partial-response protection, peerless client deep-link, current notification recipient/visibility and task ownership. No separate reminder/message store.
- Removed contact-on-mount write, unsafe OTHER link protection, view-only/DNC/stale/empty/error, narrow workspace query keys, stable HTTP retry key, lazy purchases/info/AI and mobile Back/focus.
-365-day bounded cleanup with financial/source-attribution protection and no new scheduler, timer, network or reconciliation work.

## Browser evidence

[Machine-readable report](browser-report.json). All17 checks pass at320/360/390/768/1024/1440px. The report separately records pre-existing app-shell System Bot connection POSTs and blocked Telegram web-app script attempts; these are not attributed as new manual-feature idle writes. Provider calls0, Instagram calls0, Telegram sends0. Profile links were inspected without opening real Instagram.

The integrator visually inspected desktop contact details and the short mobile keyboard-sized viewport. A harness resize timing issue initially captured the existing sidebar transition; the final run starts the keyboard check in the mobile viewport, selects the contact, focuses/scrolls the note and captures unobstructed controls. This verifies the tested mobile workflow, not physical-device keyboard behavior or every desktop-to-mobile resize transition.

The browser was closed. The pre-existing localhost server was reused and left untouched; no task-owned dev server was started.

Screenshots:

- [contact-1024](screenshots/contact-1024.png)
- [contact-1440](screenshots/contact-1440.png)
- [contact-320](screenshots/contact-320.png)
- [contact-360](screenshots/contact-360.png)
- [contact-390](screenshots/contact-390.png)
- [contact-768](screenshots/contact-768.png)
- [dnc-320](screenshots/dnc-320.png)
- [empty-390](screenshots/empty-390.png)
- [follow-up-1440](screenshots/follow-up-1440.png)
- [invalid-profile-390](screenshots/invalid-profile-390.png)
- [keyboard-390](screenshots/keyboard-390.png)
- [list-1024](screenshots/list-1024.png)
- [list-1440](screenshots/list-1440.png)
- [list-320](screenshots/list-320.png)
- [list-360](screenshots/list-360.png)
- [list-390](screenshots/list-390.png)
- [list-768](screenshots/list-768.png)
- [stale-320](screenshots/stale-320.png)
- [view-only-320](screenshots/view-only-320.png)

## Manual staging acceptance

1. Review/apply prerequisites and the separate enum migration `20261101120000_crm_instagram_contact_type`, then `20261101120100_crm_instagram_manual_contacts`, only to staging. Verify indexes/workspace uniqueness and preserve existing OTHER records for explicit review. Resolve global build errors before deployment acceptance.
2. Open Clients→manual Instagram mode with view-only, edit-own and edit-any roles. At each viewport find an Instagram-only client and an existing Telegram+Instagram client. Opening cards must not create a method/activity or AI request. Check lazy information, purchases/currencies, source, notes and preparation panels.
3. Add a profile in username, @ and HTTPS/tracking formats. Confirm raw value/canonical URL. Try unsafe hosts/schemes/content/Direct/encoded paths and duplicate/nearby handles. A duplicate must not silently merge clients; same display name with another profile remains distinct. No real profile verification or DM deep-link may be claimed.
4. Explicitly convert a legacy OTHER Instagram method, reconfirm ownership, rename it, mark stale and reconfirm. Rename must revoke old human confirmation; stale/unverified identity must remain visible. Attempt to convert a Telegram method through the IG-only endpoint and expect rejection.
5. Mark contacted/waiting/replied with a short note; simulate a lost HTTP response and retry the same operation key. Expect one manual report, monotonic compact dates and no Telegram unread/message/receipt changes. Report older dates: record the fact without rewriting unchanged compact timestamps. Equal reply/contact dates must agree between Waiting card and list filter.
6. Set Interested/Closed/DNC, attempt contacted/offer/follow-up, then report an inbound reply. DNC must remain until explicit reset. Try another user's/client's/workspace's IDs and changed-payload operation reuse; expect denial/conflict before mutation.
7. Schedule, retry, reschedule, snooze, complete and cancel a follow-up without a Telegram conversation. Verify one canonical task/occurrence, assigned owner, changed reminder reconciliation and a notification link to the authorized real CRM client. Change recipient/owner/archive/DNC before delivery to verify privacy/current-state checks.
8. From approved permitted AI Leads evidence confirm the Instagram business role/profile and human-link the client. Prefer linking before final qualification/draft so a new CRM context need not invalidate a prior proposal. Generate only explicitly through existing qualification/SALES_FIRST_DRAFT. Copy after current server freshness approval; change ad/source/contact/price/permission/DNC and ensure stale Copy/manual report is rejected. No private Instagram transcript is assumed available.
9. Report a fresh approved offer as sent manually, with the current candidate/client/draft/revision. Repeat the receipt and try another actor, client, profile, old revision or unapproved draft. The activity says human-reported, never delivered/read or a transport message. Follow-up remains a separate canonical task.
10. Merge clients with combined methods, activities/tasks/candidates and DNC. Inspect preserved raw identities, ownership history, sales/source attribution and monotonic manual facts. No new synthetic client, peer, conversation or Instagram message ID may appear.
11. Exercise loading/error/empty/denied state, keyboard/focus/scroll/Back, long names and all six widths. Test actual iOS/Android keyboard separately. Keep contact forms/notes free of per-keystroke DB writes and idle polling.
12. On staging inspect actual SQL plans, relation expansion, notification/due load and retention lag. Expire nonfinancial manual/identity audit records older365 days; run existing daily cleanup once and verify bounded deletion, retained financial attribution/compact facts, no ledger/refund changes. Test rollback with compatible readers; never restore unsafe links or blindly remove an enum containing live data.

## Runtime and limitations

Source-level costs are in the plan: list1 logical read; authoritative workflow4; ordinary manual report about10–11 data calls/2 row writes including returned view; exact replay/unchanged status about8 calls/0 writes; older fact avoids unchanged compact update. Optional AI attribution rechecks existing linked preparation context without a provider call. Manual follow-up uses existing task/notification work plus bounded wrapper/receipt overhead. These exclude authorization graphs, transaction protocol and Prisma physical query expansion; they are not Neon/Railway billing measurements.

Stored100/1,000 contacts/channels create no new recurring feature query/write/network/connection/worker. One extra bounded cleanup query runs during the existing daily wake; the global20k/day deletion cap requires capacity review above that arrival rate. Activity linked to financial attribution is retained longer. This is not unlimited SaaS storage or a zero-cost maintenance claim.

Profile existence/current ownership is human-unverified; username changes cannot be detected automatically. AI for a CRM-only contact without permitted evidence uses the explicit reviewed Discovery-material workflow, not a fake conversation or scraped profile. Existing Prompt№8 UNKNOWN-domain recovery and collection-summary limitations remain. The future official Professional-account adapter is documented using Meta primary sources, not implemented. No personal-account API synchronization or automated commercial outreach is supported.
