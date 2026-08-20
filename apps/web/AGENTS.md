# Web Agent Instructions

## Structure

- Preserve public URLs with App Router groups under `src/app/(identity|workspace|finance|growth|telegram|operations)`.
- Put domain UI in `src/components/features/<domain>` and domain API clients/helpers in `src/lib/features/<domain>`. Keep only genuinely shared UI, providers, and utilities at the top level.
- App Router `page.tsx` files should read route/search params and render feature containers.
- Feature logic lives under domain components/hooks/libs before pages grow.
- Shared UI lives in `src/components/ui`, forms in reusable/domain wrappers, app-wide behavior in `src/providers` and `src/lib`.
- Keep `page.tsx` files below 300 lines by moving UI sections, query hooks, mutations and domain utilities into feature modules.
- Keep React components and hooks below 400 lines. Split by real workflow or UI responsibility, not by arbitrary line ranges.
- Keep `@/lib/api` as a small compatibility facade only; domain endpoint implementations belong in domain API modules that reuse the single base client.

## Finance Bot required reading

- For Finance Bot or Finance Mini App work, read `docs/finance-bot/PRODUCT_RULES.md` before implementation.

## API And Query

- Use `@/lib/api` for API calls. Do not create another fetch/axios wrapper.
- Use `@/lib/query-keys` for React Query keys and invalidation.
- Keep mutation invalidation narrow and typed.
- Do not add inline string-array query keys when a shared factory exists; add the factory first when the key is cross-page or domain-owned.
- Preserve selected selector values even if they are not in the current search/pagination result.
- Treat backend read models as purpose-built contracts. Do not compensate for trimmed collection responses with per-row detail fetches or frontend join systems unless the workflow explicitly needs that shape.
- Read `docs/runtime-cost-efficiency.md` before adding `refetchInterval`, polling, repeated invalidation, or a new API read model. Polling needs an explicit operational justification; use narrow shared query keys, compact server read models, and never add per-row HTTP joins for display.
- Read `docs/frontend-cache-efficiency.md` before production mutation or React Query cache work. Reconcile authoritative mutation responses into cache; broad invalidation needs an explicit correctness reason.

## Design System

- Read `docs/design-system/BRAND_GUIDE.md`, `COMPONENT_CATALOG.md`, `PAGE_PATTERNS.md` and `FORM_PATTERNS.md`.
- Use existing primitives before adding new controls.
- Do not create local copies of selectors, date pickers, modals, tables, page headers or metric cards without searching first.
- Keep UI dense, operational and consistent with existing dark dashboard screens.

## Client/Server Boundaries

- Add `"use client"` only where hooks/browser APIs are required.
- Avoid importing feature-heavy modules into low-level UI primitives.
- Keep browser-only APIs inside effects or guarded code.
- Render entity icons/avatars with `IconAvatar` using hydrated `iconPresentation` or `avatarPresentation`. Do not pass raw `Icon` records to ordinary display, and do not add `/icons/:id` React Query calls for display-only icon rendering; `IconPicker` may load icons only for selection/editing.

## States And Accessibility

- Handle loading, error, empty and disabled states.
- Keep focus visible and labels accessible.
- Use lucide icons for icon buttons when available.
- Verify text wrapping on mobile and avoid overlapping controls.

## Testing

- Run `pnpm --filter web typecheck`.
- Run `pnpm --filter web test -- --run` for component/lib behavior.
- Run `pnpm --filter web build` for route/build-sensitive changes.
- Existing lint currently has pre-existing React compiler and explicit-any failures; report whether new files add lint debt.
- Before handoff, verify mutations use the minimum network requests, query keys are narrow, optimistic updates roll back, list/detail caches cannot go stale, and the 100-entity server-cost case has been considered.

## Reuse Search

- `rg "function .*Select|const .*Select|MultiSelect|CustomSelect" apps/web/src`
- `rg "DateInput|DateRangeInput|Picker|Modal|Table|PageHeader|Metric" apps/web/src`
- `rg "queryKey:|invalidateQueries|useQuery|useMutation" apps/web/src`
- `rg "from '@/lib/api'|from \\\"@/lib/api\\\"" apps/web/src`
