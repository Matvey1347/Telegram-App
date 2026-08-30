# Service Design Rules

This document is the implementation contract for Telegram System UI. The
[Brand Guide](BRAND_GUIDE.md) defines product character; this file defines how
that character is applied consistently across screens.

## Reference Surfaces

Use the internal Finance overview, Telegram channel and network cards, and Ad
Sales workspace as the visual references. Reuse their hierarchy, density and
surface treatment, not product-owned components or business logic.

Consumer Finance and internal Finance remain separate product boundaries. A
shared visual language never authorizes cross-product component, hook, query or
presenter imports.

## Visual Tokens

Use the semantic CSS variables in `apps/web/src/app/globals.css` when writing
plain CSS. Tailwind markup should map to the same palette:

- Canvas: neutral-950.
- Primary surface: neutral-900 at 55-70% opacity with a neutral-800 border.
- Inset surface: neutral-950 at 55% opacity.
- Selected surface: neutral-800, or blue-950/30 with a blue-700 border.
- Text tiers: neutral-100 primary, neutral-300 secondary, neutral-500 muted.
- Action/info: blue; success/income: emerald; error/expense: rose; warning or
  pending: amber; data/view: sky; audience: violet.

Color must not be the only status signal. Pair it with text, an icon, or both.

Default cards use `rounded-xl`, a one-pixel border and 16px padding. A single
top-level composite workspace may use an 18px radius. Controls use an 8-12px
radius. Avoid framed cards inside framed cards unless the inner item is a real,
repeatable unit.

## Type And Spacing

- Page title: 24-30px, semibold.
- Section title: 18px, semibold.
- Entity/card title: 16-18px, semibold.
- Body and control text: 14px.
- Metadata and compact labels: 12px.
- Money and comparable counts use tabular numerals; numeric table columns are
  right-aligned.
- Page gutters: 12px mobile, 16px tablet and 20px desktop.
- Section gap: 24px; compact grid gap: 12px; card padding: 16px.
- Controls are normally 40px high. Icon-only and touch controls must expose at
  least a 40px target; prefer 44px on mobile.

## Page And Card Anatomy

Authenticated pages use a concise `PageHeader`, followed by filters or primary
actions and then operational content. Use one primary action per section.

Entity cards follow this order:

1. Identity row: avatar, truncating title, restrained badges, action menu.
2. One compact metadata line.
3. Operational metrics: two columns on mobile, up to four on desktop.
4. Optional inset economics, pricing or diagnostic module.

Do not add decorative hero sections, gradients, or glowing shapes to the
authenticated product.

## Responsive Contract

QA widths are 360, 390, 768, 1024 and 1440px, with an additional 320px smoke
check. No page may create horizontal viewport scrolling.

- Headings and actions wrap; primary actions become full-width when that makes
  the task clearer.
- Filters stack full-width on mobile and become compact rows from `sm`.
- Card grids progress from one to two to four columns as content permits.
- Dense tabs and toolbars may scroll horizontally with an obvious active item.
- Tables need either a deliberate mobile card representation or an explicitly
  documented horizontal-scroll container. Never rely on viewport overflow.
- Modals cap at `100dvh`, keep their body scrollable and return focus to the
  opener. Sticky actions respect safe-area insets.
- The mobile sidebar is a modal drawer: it traps focus, closes on Escape,
  restores focus, exposes dialog semantics and locks background scrolling.

## Navigation

The sidebar groups work by user intent:

- Overview: dashboard and the consolidated Finance workspace.
- Telegram: channels, posts and bots.
- Growth: ad sales and ad campaigns.
- Operations: scheduled tasks, trash and role-gated system logs.
- Workspace: members, settings and personal account.

Active state matches detail routes as well as exact list routes. Collapsible
groups expose `aria-expanded`; the active route uses `aria-current="page"`.
Finance is one workspace. Accounts, transactions, categories and transfers are
sections within it. Currencies remain a focused screen linked from Finance.

## Forms And Authentication

Inputs always have visible labels; placeholders are examples, never labels.
Use correct `autocomplete` values and place validation beside the field. Auth
screens use the same calm surfaces and typography as the product, with a shared
shell, clear security copy and no marketing decoration. Password actions expose
show/hide controls with accessible names.

Submitting, success and failure states must remain stable in layout. Password
reset requests always show a neutral response that does not reveal whether an
email is registered.

## Pagination

Desktop pagination places previous/page/next controls and the visible result
range on the left. The explicit “Rows per page” selector stays on the right.
Mobile shows previous, `Page X of Y`, and next on the first row, then the result
range and page-size selector. Current pages use `aria-current="page"`, icon
buttons have names, and changing page size returns to page one through the
consumer's existing pagination state.

## States And Accessibility

- Keyboard focus uses a visible two-pixel blue ring and offset.
- Body text meets 4.5:1 contrast; large text meets 3:1.
- Loading skeletons preserve final geometry.
- Errors explain recovery and offer retry when useful.
- Empty states explain what is absent and provide one useful action.
- Respect `prefers-reduced-motion`.
- Verify keyboard-only use, 200% zoom, long translated labels and loading,
  error and empty states before handoff.

