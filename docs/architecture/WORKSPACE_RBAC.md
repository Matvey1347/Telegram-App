# Workspace RBAC Architecture

## Purpose

Workspace RBAC controls access to the internal Nexeloq operations product. It
does not replace Telegram source/admin capabilities and does not cross into the
independent Consumer Finance application.

The canonical feature and permission catalog lives in
`packages/shared/src/permissions`. Backend authorization, Role Editor,
navigation, search and dashboard visibility consume
that registry instead of duplicating permission strings.

## Policy Model

A workspace role is a shared entity assigned to one or more members. Members do
not store copied permissions. Editing a role therefore changes access for every
assigned member on their next request.

Roles support two modes:

- `ALLOWLIST`: deny by default and allow selected permission IDs.
- `DENYLIST`: allow the registry by default and store selected exceptions.

The immutable system Owner role always resolves to the complete registry. Its
critical access cannot be edited or denied. A workspace may have multiple
owners, but it must never lose its last owner.

Permission IDs are stable machine identifiers such as `posts.editOwn`,
`adSales.sales.editAny`, `finance.executeTransactions` and
`members.assignRoles`. The registry exposes i18n keys for the localization
layer; until those catalog entries land, the Role Editor uses an English
fallback map. Permission IDs are never translated.

## Capabilities And Ownership

Ordinary feature capabilities are:

| Capability  | Meaning |
| ----------- | ------- |
| `view`      | Read the feature and its permitted collection scope. |
| `create`    | Create a resource, normally assigned to the actor. |
| `editOwn`   | Edit a resource owned by the actor's workspace member. |
| `editAny`   | Edit any resource in the workspace. |
| `deleteOwn` | Delete an actor-owned resource. |
| `deleteAny` | Delete any resource in the workspace. |
| `manage`    | Configure or administer the feature. |

Sensitive actions such as publishing, runtime/credential management, payment
registration, finance execution, role assignment and workspace deletion use
explicit permission IDs in addition to generic capabilities.

“Own” is not inferred generically. Each resource family declares one resolver:

| Resource family | Ownership field |
| --------------- | --------------- |
| Accounts, transactions, transfers, investments | `assignedMemberId` |
| Channels and channel networks | `assignedMemberId` |
| Managed posts | `assignedMemberId` |
| Post groups | `createdByMemberId` |
| Ad Sales | `assignedMemberId` |
| CRM advertisers | `ownerMemberId` |
| CRM tasks | `assignedMemberId` |
| Campaigns, promos, sources and hypotheses | `assignedMemberId` |
| Bots and Telegram user accounts | `assignedMemberId` |

Child resources may inherit the parent resolver. A creator user ID must not be
silently substituted for assignment/ownership semantics.

## Request Path

```text
JWT authVersion check
  -> request-scoped WorkspaceAuthorizationService
  -> one membership + role + permission-delta query
  -> in-memory effective permission evaluation
  -> domain require/scope check
  -> workspaceId + ownership predicate in Prisma
```

The authorization context memoizes its promise for the lifetime of the request.
It never performs a query per decorator or capability. Lists apply ownership in
the database so pagination and totals cannot leak hidden rows. Detail, update
and delete flows use a scoped preflight rather than fetching an unrestricted
entity and filtering it in JavaScript.

## Surface Enforcement

UI visibility is an affordance, never the security boundary.

- Navigation items declare a feature/permission requirement.
- Global search constructs only query branches for accessible features.
- Dashboard executes and returns only accessible metric groups.
- Direct routes handle backend `403` with a permission state.
- Buttons may be hidden or disabled from the effective access snapshot.
- Every migrated API use case independently enforces the same permission and
  ownership scope. Registration or UI hiding alone never marks an API secured.

Server response-cache keys for permission-aware reads must include member scope
and role version. A role mutation increments the version transactionally. No
polling, timers or background invalidation are required.

## Registry Extension Checklist

Adding a feature requires:

1. Add one feature entry and its stable permissions to the shared registry.
2. Add i18n strings for its registry keys.
3. Declare navigation/search/dashboard surface IDs.
4. Select and document the domain ownership resolver.
5. Enforce permissions in backend list/detail/create/update/delete use cases.
6. Add none/view/own/any/manage, cross-workspace and sensitive-action tests.

The registry automatically makes the feature available to Role Editor.
Registration alone cannot secure a new endpoint; backend enforcement and the
documentation checklist remain mandatory.

## Enforcement Rollout

The request-scoped policy engine is currently authoritative for internal
Finance, permission-aware Dashboard and Global Search reads, and selected Ad
Sales/CRM list and settings reads. Other legacy domain paths remain on the RBAC
migration checklist until their list, detail and mutation paths use the same
authorization service. UI hiding is not a security claim for Channels, Posts,
Bots, Growth, Operations or workspace settings until those backend slices are
migrated.

## Runtime Cost

RBAC adds one indexed membership/role/grants read per useful authenticated
request and request-local set evaluation. It adds no idle queries, polling,
external calls, recurring writes or retention tables. Own-only lists remain one
indexed list query plus count, not per-row authorization calls.
