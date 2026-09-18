# Integrating System Bot post import into a modal

Website-driven post capture is a Telegram integration concern, not a Growth,
Ad Sale, Folder, Campaign, or Post Batch concern. Every consumer uses the same
API and frontend controller and chooses one of two modes:

- `single` captures exactly one logical Telegram publication (an album still
  counts as one publication);
- `multiple` captures up to the shared bounded import limit.

The canonical HTTP contract is:

- `POST /telegram/system-bot/post-imports` with `{ "mode": "single" }` or
  `{ "mode": "multiple" }`; consumers also provide a short human-readable
  `context` (for example `Ad sale` or `Mass publication`) for the Bot prompt;
- `GET /telegram/system-bot/post-imports/:workflowId` for reconciliation;
- `DELETE /telegram/system-bot/post-imports/:workflowId` for explicit cancel;
- `POST /telegram/system-bot/post-preview` for sending an edited draft back to
  the connected System Bot.

Do not call these endpoints directly from a feature. Use the shared hook:

```tsx
const postImport = useTelegramSystemBotPostFlow({
  mode: "single",
  workspaceId,
  botUsername,
  recoveryKey: "my-feature-editor",
  importContext: "My feature",
  onImported: (draft) => setDraft(draft),
});
```

Render the shared import controls used by the surrounding surface, call
`postImport.startImport()`, `postImport.checkImport()`, or
`postImport.cancelImport()`, and display `postImport.error`. The controller owns
the workspace-scoped recovery key, active-import conflict message, bot opening,
bounded visibility-aware reconciliation, and terminal cleanup.
`recoveryKey` is a stable frontend owner name, not a backend feature type. It
prevents another surface using the same workspace and mode from restoring the
wrong workflow. Reuse the same value whenever that consumer is reopened; do
not encode it into an API URL or create a feature-specific capture contract.
Starting while any import is already active returns the canonical active-import
conflict. The shared hook asks for English-language replacement confirmation;
the app-wide provider renders that confirmation as a product modal rather than
a native browser dialog. On confirmation it retries with `replaceActive: true`.
The API cancels the old workflow and removes its Telegram control message before
creating the new one. After every successful capture, the Bot sends the actual
post preview. A `single` import completes immediately after a non-album post is
captured, so the website can continue without an extra Telegram callback.
Telegram albums remain active until the user presses Finish because their media
arrives as several updates. A `multiple` import recreates its Finish/Add/Cancel
controls beneath the preview. Reload recovery always uses the persisted workflow
ID and read route.

For `multiple`, keep the returned drafts in feature state and collect each
draft's schedule or other business fields there. Folder saving, Post Batch
materialization, channel selection, slots, invite-token rendering, Ad Sale
products, lifetime, and publication validation must remain downstream domain
operations.

Use the reusable Telegram post-draft editor for title, text, media, buttons,
and preview when its semantics fit. Compose feature-specific controls beside
it; never add them to the generic editor.

Before merging a new consumer, verify that no new System Bot URL, backend
capture service, workflow kind, localStorage protocol, or polling loop was
introduced. Idle, hidden, terminal, and unmounted consumers perform no reads.

The migration to this contract expires only unfinished workflows created by
the removed website-specific flows. Their old browser storage and Telegram
callback formats cannot be resumed safely through the canonical contract, and
expiring them prevents a stale workflow from blocking a new import. Ordinary
`/post` workflows are preserved. Imports started after the migration remain
recoverable across reloads through the shared workspace-and-mode storage key.
The key also stores the stable recovery owner so another consumer cannot claim
that workflow after navigation.
