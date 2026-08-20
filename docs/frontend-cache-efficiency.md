# Frontend cache efficiency

This is the required standard for production React Query changes. It complements
the workload and polling rules in [runtime-cost-efficiency.md](runtime-cost-efficiency.md).

## Mutation rule

When a mutation returns a known authoritative entity, reconcile that entity into
the relevant list/detail cache. Do not refetch a whole collection merely to
display the response already received.

## Invalidation rule

Invalidate only state that actually changed and cannot be reliably derived from
the mutation response. Patch a known entity and narrowly invalidate server
derived totals, analytics, calendar ranges, or other purpose-built read models.

## Query keys

Each domain owns structurally distinct `all`, `list`, `detail`, `select`, and
aggregate key families. Never use a root prefix as a convenient list key.

## Optimistic updates

Use them only for deterministic interactions such as toggles and simple edits:
cancel relevant in-flight requests, snapshot, patch, reconcile the successful
server response, and restore the snapshot on failure. Serialize controls or
otherwise guard against stale out-of-order responses.

## External and bulk operations

Telegram sync, imports with unknown side effects, reconciliation, and bulk or
complex financial operations may refetch. Their invalidation must still be
narrow: affected detail, analytics, posts, calendar range, or derived aggregate
only—not an entire application or unrelated workspace domain.

## Anti-patterns

Do not add `onSuccess: () => invalidateQueries({ queryKey: domainRoot })` when
the response is sufficient. Avoid per-row refreshes, duplicate list/detail GETs,
and polling that duplicates mutation reconciliation. Before a broad
invalidation, evaluate mutation frequency × refetch queries × users × entities,
including the 100-entity case.
