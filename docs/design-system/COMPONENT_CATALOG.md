# Component Catalog

All components must follow the tokens, responsive behavior and accessibility
contract in [Service Design Rules](SERVICE_DESIGN_RULES.md).

## UI Primitives

Shared UI primitives should be organized by component family instead of growing one large file. Keep family modules focused, for example controls, overlays, tables, cards, states and page chrome. Barrels may re-export stable primitives for compatibility, but shared UI barrels should stay small and should not become the implementation home for unrelated components.

Before adding a primitive or domain wrapper, search for an existing selector, date picker, modal, table, page header or metric card and normalize repeated behavior into the shared family/module. Do not create page-local copies of these controls.

### `Button`

- Import: `@/components/ui/primitives`
- Use for primary, secondary and destructive commands.
- Do not use as a selector replacement.
- Used across authenticated pages and modals.

### `Input`, `Textarea`, `Select`

- Import: `@/components/ui/primitives`
- Use for standard form controls.
- Use domain wrappers for entity selection when data loading/search is involved.
- Pass `uiLocale` to searchable shared controls so search, empty and helper copy follow the active product locale.

### `CustomSelect`, `MultiSelect`

- Import: `@/components/ui/primitives`
- Use when native select is not enough for visual option metadata or multiple selection.
- Do not create local multi-selects before checking these.

### `SortControl`

- Import: `@/components/ui/sort-control`.
- Use for internal paginated lists that let the user choose both a sort field
  and ascending/descending direction. Keep the field selector and adjacent
  direction button as two independent controls.
- Sort paginated data on the server before `skip`/`take` or cursor slicing,
  include both values in the query key, and reset the page when either changes.
- Consumer applications keep a product-owned visual wrapper so their UI and
  localization remain inside the product boundary.

### `TimezoneSelect`

- Import: `@/components/ui/timezone-select`
- Use for internal workspace and product settings that store an IANA timezone.
- Shows the region flag and current UTC offset, and supports search by timezone or offset.
- Consumer products keep their own visual wrapper and may reuse only the neutral presentation data from `@/lib/timezones`.

### `DateInput`, `DateRangeInput`

- Import: `@/components/ui/primitives`
- Use for date and date-range fields.
- Preserve existing timezone semantics when migrating page-local date logic.
- Pass `uiLocale` when the host product is localized; do not recreate translated calendar controls per feature.

### `Modal`, `ConfirmDeleteModal`

- Import: `@/components/ui/primitives`
- Use for task modals and destructive confirmation.
- Do not hand-roll overlay/focus behavior in feature pages.

### `PageHeader`

- Import: `@/components/ui/primitives`
- Use for authenticated page headers.
- Keep supporting copy short.

### `Table`

- Import: `@/components/ui/primitives`
- Use as the base for data tables.
- Add feature wrappers for loading/empty/error/pagination.

### `Card`, `Skeleton`, `EmptyState`, `LoadingState`

- Import: `@/components/ui/primitives`
- Use for repeated framed content and standard states.
- Avoid cards inside cards.

### Metric Cards

- Use an existing metric card pattern or create a focused shared wrapper when repeated.
- Keep metric cards compact and operational.
- Do not duplicate one-off metric card markup across pages.

## Domain Components

### Shared Chat UI

- Import focused modules from `@/components/chat/*`.
- `ChatShell`, `ConversationList`, `ChatThread`, `MessageBubble`,
  `MessageActions`, `MessageComposer`, `AttachmentPreview` and
  `ChatDetailsPanel` are neutral presentation controls.
- Hosts supply typed models, capabilities, action callbacks, editor and details
  slots. Keep transport mapping, business rules, query state and drafts in the
  owning feature. Never enable an action without its server implementation.
- Reuse the existing Telegram editor/picker through the composer slot.
- See [CRM Inbox 2.0](../plans/crm-inbox-2.md) for the first adapter, mobile
  behavior, test-only Support scenario and capability matrix.

### CRM Inbox folders

- The CRM host places `CrmInboxFolders` beside the conversation list. It displays account-specific Telegram folders and server-calculated unread-message counts; choosing Unread returns to all folders.
- Folder selection and unread aggregates use the workspace-scoped CRM query layer. Visible-message auto-read uses the shared chat viewport and existing body-overlay lock; Telegram read watermarks remain owned by CRM.

### `MemberSelect`

- Import: `@/components/features/workspace/member-select`
- Use for workspace member assignment.
- Uses `memberKeys.members()` and `workspaceMembersApi.list`.
- Supports current-user defaulting and role-aware disabling.

### `IconPicker`, `InlineIconPicker`

- Import: `@/components/icons/icon-picker`, `@/components/icons/inline-icon-picker`
- Use for emoji/image icon assignment.
- Do not create separate emoji pickers unless the workflow cannot use icon semantics.
- Pass hydrated `iconPresentation` or `avatarPresentation` for display. Do not pass raw `Icon` records or add entity render paths that call `/icons/:id`.
- `IconPicker` receives `uiLocale`; its chrome and RU/UK search aliases are owned by the shared `@/lib/ui-i18n` layer, not by Finance or another feature.

### `TelegramPostPreview`

- Import: `@/components/features/telegram/telegram/telegram-post-preview`
- Use for Telegram post rendering and preview.
- Keep Telegram-specific formatting here rather than duplicating preview markup.

### `InviteLinksTable`

- Import: `@/components/features/telegram/telegram/invite-links-table`
- Use for invite link lists and attribution views.

### Invite link selectors

- Use `TelegramInviteLinkOptionLabel` for purpose icons in selected values and option rows. Its purpose text is hidden on small screens while each icon retains an accessible label.
- Offer “Verify and add this invite link” for a typed Telegram invite URL. Use `useRegisterTelegramInviteLink` or the existing verified import flow so the server checks that the link belongs to the selected channel before selecting it.

### `AdSaleModal`

- Import: `@/components/features/growth/ad-sales/ad-sale-modal`
- Use for ad sale creation/editing.
- Existing tests cover selected post loading, format pricing and selector retry behavior.

### `CommonAdSlotOptions`

- Import: `@/components/features/growth/common-ad-slot-options`.
- Use beside a manual time field when one advertising time should apply to selected channels.
- Loads when channels and a date are selected, shows advertising schedule times directly beneath the common time field, and enables a time only when it is available in every selected channel. Selecting a time fills the caller's existing time fields; manual entry remains available.

## New Shared Modules

### Query Key Factories

- Import: `@/lib/query-keys`
- Use for React Query `queryKey`, `invalidateQueries`, `resetQueries` and `setQueryData`.
- Factories currently include auth, workspace/member, account, currency, Telegram channel, Telegram post, Telegram account, ad campaign and network keys.

### API Types

- Import compatibility remains `@/lib/api`.
- Implementation file: `@/lib/api-types`.
- Do not import directly from `api-types` in app code unless the facade is intentionally being retired.

### Overlay hosts and nested scroll locks

- Internal popups use `overlayPortalHost(anchor)` from `components/ui/overlay-portal-host`: prefer their owning `[data-app-modal]`, then an open native dialog, then the document body. Shared `Modal` consumes the neutral `OverlayPortalContext` when a native parent owns the top layer.
- Reuse `useDismissiblePopover` for outside-click/Escape dismissal and trigger focus restoration. A popup must consume its own Escape before a parent dialog closes, and its interactive portal must remain within the parent focus boundary.
- Native and shared modal hosts use `acquireBodyScrollLock` from `lib/body-scroll-lock`, releasing their own token on cleanup. Do not independently restore `document.body.style.overflow` in nested overlays; parent/child unmount order must preserve the original value.
- CRM is only the first nested native-dialog consumer; these helpers contain no CRM state, transport, permissions or business logic. See the regression tests in `components/ui/overlay-portal-host.test.tsx` and `components/chat/chat-details-scroll-lock.test.tsx`.

### Internal AI Usage

`CrmAiUsage` shows the current workspace's month-to-date cost, tokens and request count in one compact always-visible row. It uses the canonical workspace ALL usage query (including Sales and Discovery), shared 60-second cache and operation-settlement invalidation; no polling or per-chat request. Detailed statistics remain at `/settings/ai-usage`. Unknown charges remain explicit.

### CRM AI Sales Copilot

The thread exposes one `Сгенерировать ответ` action. The server-owned `copilot/suggest` preset assembles bounded verified workspace offers/networks, client history, purchases, authorized notes and the current manager's recent accepted/rejected examples in this conversation. No per-chat configuration or catalog-selection waterfall is required. The result is an editable compact text field with `Использовать` (approve exact text then insert) and `Не подходит` (persist negative feedback). Normal Send remains explicit; canonical composer drafts and overwrite confirmation remain. This is contextual adaptation from bounded seven-day feedback, not model fine-tuning. Unresolved generation is checked using the same operation, even after closing the panel; server claims prevent duplicate paid requests across tabs.

The sidebar uses compact chat context and parallel independent purchases/workflow/notes reads. Telegram contact links, Add note, notes/history and follow-up are visible; package catalog and profile navigation do not occupy this surface. A single purchase does not repeat its aggregate total. The editor-expansion action is an accessible lucide icon button.

### CRM Lead Discovery

`/ad-sales/leads` has one Sources screen with compact source rows and a primary refresh action. Connection status explains unconfigured, lost access, paused, active and public manual-scan states. Additional source actions use the shared ActionMenu. Found advertisements and candidate review are lazily opened sections on the same screen, preserving the pipeline without three top-level tabs. No analysis occurs simply by opening the page. Activation requires actual verified access and exact processing grants; registered sources are never presented as active merely because a URL was saved.

### AI Leads qualification workbench

CRM `features/growth/ad-sales/crm/leads` composes the candidate queue, evidence/contact center and qualification/first-offer pane. Desktop uses separate operational panes; mobile switches between list and details. Qualify, human qualification, Generate, Save, Approve and freshness-checked Copy remain separate explicit actions. Reuse canonical candidate review/linking and shared controls; no lead rule enters Shared Chat UI. The lazy CRM acquisition section loads only when expanded. AI Usage request history can filter candidate-first-offer receipts without changing aggregate scope.

### Manual Instagram CRM contacts

Clients manual mode composes a compact list and contact detail workflow under `features/growth/ad-sales/crm/manual`. Mobile switches list/detail and restores Back focus; purchases/info/prepared offers stay lazy. Typed Instagram profiles use the shared parser/server presentation and explicit Open action. Human ownership confirmation is distinct from unverified profile existence. Manual reports reuse canonical activities/status/tasks and never render as chat messages or receipts. `CrmContactChannels` no longer writes detected contacts on mount and does not render unsafe raw OTHER links.

### Shared Chat UI actions and lazy media

`components/chat/*` exposes neutral per-message capabilities/callbacks, typed attachments, reply context and accessible action menus. CRM owns Telegram operations, entity mapping, permissions, DNC, provenance and cache reconciliation. Reuse the existing rich editor for edit; preserve normal composer drafts. Media loading is explicit and adapter-authorized; UNKNOWN operations require result checks rather than blind Retry. A test-only Support adapter verifies differing capabilities. See [chat action plan](../plans/telegram-chat-actions.md).
