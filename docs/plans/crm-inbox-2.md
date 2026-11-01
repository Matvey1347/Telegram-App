# CRM Inbox 2.0

Implementation: 2026-10-30. Visual reference: the approved `ai-sales-crm-interactive-v2.html` supplied in this task. Production uses React, existing Telegram editor and internal design primitives; prototype scripts, demo customers and AI draft generation are not production data or behavior.

## Architecture

`apps/web/src/components/chat` is a browser presentation layer. `ChatShell`, `ConversationList`, `ChatThread`, `MessageBubble`, `MessageActions`, `MessageComposer`, `AttachmentPreview` and `ChatDetailsPanel` accept neutral models, capabilities, callbacks and slots. They do not import CRM clients, query keys, MTProto, business services or persistence. Avatars use the existing `ResolvedEmoji` / `IconAvatar` contract. The existing editor supplies emoji and formatting through the composer slot; a second EmojiPicker implementation was unnecessary.

`crm-chat-adapter.tsx` maps CRM records to Chat UI models and exposes actual transport capabilities. CRM owns all queries, mutations, history, drafts, contact permissions and Telegram presentation. A test-only mock Bot Support conversation exercises different capabilities through the same components. Future Support can supply its own adapter/editor/details and use these components without importing CRM implementation. No Support runtime, shared CRM/Support message database, Bot API integration or product-boundary exception was added.

`GET /telegram-crm/inbox/conversations` is a compact per-account/peer conversation read model containing linked clients and unlinked peers. Existing `/inbox` remains the separate unlinked-peer promotion contract used by existing workflows. It is not a second message store. The new endpoint uses explicit selects, one latest-message preview capped at 240 characters, and keyset pagination `(lastMessageAt DESC NULLS LAST, id DESC)`, with a validated nullable cursor, `limit <= 100`, and `limit + 1`. It does not count/group/offset or load full histories. Existing conversation/message indexes are reused; no schema migration was needed. Search is capped at 100 characters and debounced 250 ms in the browser.

All list/detail/message operations retain workspace and viewOwn/viewAny authorization. Own-only scope excludes unassigned contacts. The UI queries account send availability once through its existing cached key. Actual sending is still independently authorized by the server.

## Behavior

Desktop keeps the list mounted beside the selected conversation; the optional details panel reduces thread width. At widths <=768 px there is one primary screen. A selected thread overlays the shell; details use a native fullscreen modal focus boundary. Selection pushes browser history; subsequent selections replace the selected entry; Back returns to the list. Details have their own history entry. Deep-link Back returns to Inbox. Mounted list scroll/search/filter state is retained across conversation selection.

The feature owns bounded viewport height and responds to visualViewport resize/scroll for mobile keyboard changes. Composer bottom padding includes safe area. Actual iOS/Android keyboard and installed PWA behavior still require device QA; a desktop browser viewport test does not prove every mobile browser behavior.

Drafts use canonical `useWorkspaceModalDrafts`, the workspace-modal-drafts codec and `ModalDraftPicker`, scoped by workspace and conversation. Continue/Delete/Create new semantics remain shared. Each draft retains its send key on failure. Concurrent clicks are guarded synchronously. Retry reuses the same key, and successful composer/bubble retry clears the matching draft. Changing a different draft does not clear it. Sending waits for the first history page to succeed, so an optimistic message cannot fabricate an otherwise-unloaded history.

Filters:

- All: ACTIVE conversations, including CRM clients and unlinked peers.
- Unread: local persisted unreadCount > 0.
- Needs reply: an inbound timestamp exists and is newer than outbound, or outbound is absent.
- Follow-up: linked contact.nextContactAt is due (<= server now); it does not mean every scheduled reminder.
- Archived: ARCHIVED conversations. IGNORED remains separate legacy workflow state.
- AI Leads: truthful empty page with no discovery query, AI API or fabricated lead.

Read state may be UNKNOWN for imported Telegram history. Opening a chat does not silently issue a mark-read command; the explicit Mark read action is available when unreadCount > 0.

## Capability matrix

| Capability | CRM Inbox | Evidence / limitation |
|---|---|---|
| Send text | Yes, authorized connected account | Existing send endpoint and deterministic Telegram randomId/idempotency key |
| Bold/italic/underline/strike/code/link and supported entities | Yes, send path | Existing Telegram editor, markup parser and MTProto entities |
| Emoji / Premium picker | Yes | Existing editor; Premium data loads only after its tab opens |
| Quick replies | Yes, built-in editable starting points | Inserts into editor; never auto-sends or invents prices/client facts |
| Read | Yes | Existing read endpoint and authoritative unread events |
| Failure/retry | Yes | Original key survives failure; formatted replay comparison fixed |
| History pagination/import | Yes | 50-message DB cursor pages; explicit bounded Telegram import |
| Copy text | Yes | Shared action menu, clipboard errors handled |
| Incoming edits | Yes | message.updated payload patches cache from existing UPDATE RETURNING |
| Reply / own edit / own delete | Unavailable | No existing CRM command/adapter methods; controls hidden |
| Reactions / forwarding | Unavailable | No CRM command/adapter methods; controls hidden |
| Image/file upload / voice send | Unavailable | No authorized CRM media upload/download API; controls hidden |
| Mark unread | Unavailable | No CRM command; control hidden |
| Heavy incoming media | Metadata only | CRM currently stores mediaType, not reusable download URLs; no fake preview/download link |
| Incoming formatting entities | Limited | Current normalizer stores plain text, not full entity runs; manual markup is rendered through existing safe inline formatter |
| User-managed saved template library | Follow-up | Built-in quick replies are included; no template persistence endpoint added |

Future action work should be one bounded server slice with permission checks, Telegram-specific behavior in telegram/shared, truthful entities/metadata, failure coverage and cache reconciliation. Reply/edit/delete/reactions require that slice before enabling their flags. Media additionally needs authorized lazy download/upload, size bounds and retention. This phase does not implement Bot Support, Instagram Direct, AI Copilot or Lead Discovery.

## Realtime and cache

One CRM-owned `useTelegramCrmRealtime` subscription feeds cache reconciliation. It aborts while hidden, closes on unmount, and reopens when workspace scope changes. Reconnect reconciles active message caches and the compact first page. Message payloads patch existing history only; an unopened thread still loads its full first cursor page. Known messages/read changes patch compact rows, including entry into another cached filter, without a list refetch. Unknown conversations coalesce a first-page reconciliation after 250 ms; no idle timer is armed. Companion contact/inbox events do not cause per-message collection invalidation. Incoming edits carry authoritative payloads without an extra DB query.

The existing event hub is process-local. Multi-replica routing/delivery remains an infrastructure limitation; this implementation does not add Redis, workers or persistent event logs. Cursor pages are a live list, not a database snapshot; the frontend deduplicates rows by conversation ID when activity reorders them.

## Runtime cost

No second MTProto runtime, worker, cron, polling, refetchInterval, DB heartbeat, AI request, schema/index, persistent telemetry or retention increase was added. Existing MTProto socket/lease costs remain. SSE adds one HTTP stream per visible CRM client and no dedicated PostgreSQL connection per conversation. Hidden clients close it.

Opening Inbox performs one bounded list request plus existing auth/unread reads. Selecting a chat reads its exact authorized detail and a 50-message history page; account data is cached. Details, purchase history, notes and reminders are fetched only when requested for the selected client. There is no per-row HTTP join. Prisma may compile nested selects into several statements; one findMany call is not a measured claim of one SQL statement.

At 50 conversations per page, 100 conversations require at most two explicitly traversed list pages; 1,000 require twenty. The rendered list window stays below 25 row elements in tests. The 1 workspace / 2-channel, 1 workspace / 100-channel and 10 workspace / 1,000-channel cases introduce zero recurring per-channel work: cost follows visible users, opened pages and actual events. Known live messages add zero list SQL/HTTP; unknown bursts coalesce per visible client. No unchanged-state write is added. Message retention and existing runtime lease Neon wakeups are unchanged. Production EXPLAIN, p95 timings, RSS/CPU, payload bytes and currency savings were not measured; no numeric savings claim is made.

## Validation and manual QA

See `docs/qa/inbox-2/README.md` and its fixture screenshots. Browser checks use the real web components with intercepted test API data, never real customer messaging. No production migrations were run.

Manual acceptance:

1. With viewAny + send permission, open Inbox at 1440 and 1024 px. Search, use every filter, load subsequent cursor pages, rapidly switch accounts/clients, and open/close details. Verify Clients/Sales/Calendar still navigate normally.
2. At 320, 390 and 768 px, verify list -> full thread -> fullscreen details, native/browser Back in each state, preserved list scroll, no sideways document scrolling and usable focus targets.
3. On iOS Safari, Android Chrome and installed PWA, open the keyboard, type long text and links, rotate, dismiss keyboard, and verify composer visibility and safe area. Browser resize checks supplement this device step.
4. Use a test Telegram peer only. Send text/formatting/emoji, simulate a lost HTTP response, retry the same draft and bubble, and verify one Telegram message and draft cleanup. Disable account send/session/permission and verify unavailable sending. Fail history GET and verify send stays disabled until successful retry.
5. Leave different drafts in two conversations and two workspaces. Reopen and use Continue/Delete/Create new. A successful retry must clear only its matching draft.
6. Deliver incoming messages/edits while a chat is open and while Unread/Needs Reply starts empty. Check preview, filter entry, message update, authoritative unread counts, no duplicates, no normal-message list refetch. Hide/show the tab and change workspace; verify stream close/reconnect and no foreign data.
7. Test equal timestamp and null-tail cursor pages, 100/1,000 conversations, search @handle, empty/error states, denied/own-only access, revoked account permissions and stale links. Confirm no unsupported action is enabled.
