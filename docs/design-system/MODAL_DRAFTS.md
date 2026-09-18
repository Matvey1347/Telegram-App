# How to add local drafts to a modal

Use the existing browser-local draft session for unfinished modal forms. Do not
add feature-owned `localStorage` parsing, draft IDs, readiness refs, autosave
timers, or a second picker.

The three canonical pieces are:

- `useWorkspaceModalDrafts` for the React lifecycle;
- `workspace-modal-drafts` for the versioned workspace-scoped storage format;
- `ModalDraftPicker` for Continue, Delete, and Create new.

The feature owns only its serializable form type, correct seed, normalization,
meaningfulness rule, local preview metadata, restore mapping, and successful
submit action.

## Minimal integration

```tsx
const emptyForm = useCallback(
  () => ({ title: "", channelId: initialChannelId ?? "" }),
  [initialChannelId],
);

const drafts = useWorkspaceModalDrafts<FormValue>({
  namespace: "example:create:draft",
  workspaceId: selectedWorkspaceDraftScope(),
  schemaVersion: 1,
  open,
  enabled: !existingEntity,
  value: form,
  createInitialValue: emptyForm,
  normalize: normalizeExampleDraft,
  isMeaningful: (value) =>
    value.title.trim() !== "" || value.channelId !== (initialChannelId ?? ""),
  previewFor: (value) => ({ title: value.title.trim() || "Untitled draft" }),
  onRestore: setForm,
});

return (
  <Modal open={open} onClose={onClose} title="New example">
    {drafts.pendingDrafts.length ? (
      <ModalDraftPicker
        drafts={drafts.pendingDrafts}
        onContinue={drafts.continueDraft}
        onDelete={drafts.deleteDraft}
        onCreateNew={drafts.createNewDraft}
      />
    ) : (
      <ExampleForm
        value={form}
        onChange={setForm}
        onSubmit={async () => {
          await createExample(form);
          drafts.clearCurrentDraft();
          onClose();
        }}
      />
    )}
  </Modal>
);
```

Keep `namespace` stable and do not append a workspace ID; the shared codec does
that. For recoverable edits, include the domain identity in the namespace, for
example `example:edit:${entity.id}:draft`, so edits of different entities never
mix. `createInitialValue` must reproduce the modal's real defaults, including
prop-dependent channel, date, or advertiser values.

`normalize` receives unknown stored data and its source schema version. Return a
valid current value or `null` to discard an unusable record. Increment
`schemaVersion` when the stored form contract changes and keep the required
legacy conversion in this feature-owned normalizer. Use `legacyNamespaces` or
`legacyKeys` only to migrate an existing deployed key.

Preview data is persisted with the draft. Supply compact local text,
`ResolvedEmoji`, and at most the useful channel avatar metadata already present
in browser state. The shared picker renders only three avatars plus a count and
never hydrates previews over HTTP.

Call `clearCurrentDraft` only after the domain mutation succeeds. Close/cancel
does not clear a meaningful draft; failed submission keeps it. An untouched
seed must make `isMeaningful` return false, preventing empty storage entries.
Local modal drafts are not domain `DRAFT` entities and must never be sent to a
backend, React Query cache, PostgreSQL, or a background worker.

`enabled` is the canonical create-versus-edit boundary. Pass `false` while
editing an already saved entity unless that feature explicitly supports
recoverable edit drafts. While disabled, initialization and every session
action are inert, so calling `createNewDraft` cannot accidentally persist an
existing entity as a local draft.

## Required tests

Cover the observable feature behavior: untouched seed, close/reopen restore,
Create new preserving the previous draft, selection of the requested draft,
deleting one and the last draft, successful-submit cleanup, failed-submit
retention, and workspace/entity isolation. Add normalization coverage whenever
the value shape or a deployed storage key changes.
