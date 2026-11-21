# Local development and production workflows

Use the Node and pnpm versions in the repository and install with
`pnpm install --frozen-lockfile`. Run commands from the root.

| Command | Browser | Business logic, data and Telegram |
| --- | --- | --- |
| `pnpm dev:local` | `http://localhost:3000` | Local Next and Nest on port 4000. Verified Compose PostgreSQL on port 5433. Real local test data. |
| `pnpm dev:prod-ui --live` | `http://127.0.0.1:3010` | Local Next. Deployed API handles reads, writes and Telegram. |
| `pnpm dev:prod-operator --live` | `http://127.0.0.1:3003` | Local Next and request-only Nest on port 4003. Local business services use the checked production DB. The existing Railway API performs the supported Telegram I/O. |

The two live launchers bind loopback and show **PRODUCTION — LIVE ACTIONS**.
Both accept `--web-port PORT`. The adjacent port is reserved for internal
Next. Operator also accepts `--api-port PORT`. Browser requests use same-origin
`/api`, and application secrets stay out of the frontend.

## Local

Start PostgreSQL with `docker compose up -d postgres`. Configure the normal
local `.env` with a Compose PostgreSQL URL on `localhost:5433`,
`127.0.0.1:5433` or `[::1]:5433`. Run `pnpm dev:local`. It validates the
effective connection and Compose binding before running `db:deploy:safe` and
starting API and web. Shell overrides take precedence. Clear a stale override
with `unset DATABASE_URL` on macOS/Linux or
`Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue` on PowerShell.

Use test data and accounts. The ordinary launcher does not enable mocks or
attach a production bot. Add the configured LOCAL test bot and tunnel using
`pnpm dev:local --cloudflare --system-bot`. Finance uses `pnpm dev:finance` and its own
[setup](FINANCE_SETUP.md).

## Live UI

Run `pnpm dev:prod-ui --live`, open the printed address and sign in normally.
Select the workspace and channel in the existing UI. The gateway forwards the
ordinary bearer and workspace selection to the deployed API. Each supported
write requires same-origin confirmation. This mode is for frontend work and
comparison with the deployed backend.

## Live operator

Use a private ignored profile directly under `.codex/tmp`. On macOS/Linux:

```sh
mkdir -p .codex/tmp
install -m 600 docs/setup/production-operator.env.example .codex/tmp/.env.production-operator.local
```

On Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force .codex/tmp | Out-Null
$ProfilePath = ".codex/tmp/.env.production-operator.local"
Copy-Item docs/setup/production-operator.env.example $ProfilePath
icacls $ProfilePath /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(R,W)"
```

Fill the named owner, workspace and active channel IDs in your local editor.
Set both `OPERATOR_SALE_ID` and `OPERATOR_PLACEMENT_ID` for Ad Sales. The
placement must already have a managed post in that channel. Keep the dedicated
Neon role's connection URL in the private profile. Use `sslmode=verify-full`
and a role without database or schema CREATE, ownership, owner-role membership
or BYPASSRLS. Grant the reads and scoped DML needed by the selected flows,
including managed posts, revisions, the send journal and the selected placement.
Keep the normal `.env` local and move any development env files out of
`apps/web` before starting the live launcher.

Calculate `PRODUCTION_DATABASE_FINGERPRINT` from approved endpoint metadata
independently of the profile. Supply only `hostname:5432/database` to this
command.

```sh
node -e "process.stdout.write(require('node:crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "approved-neon-host:5432/database"
```

```sh
pnpm dev:prod-operator --live
```

The launcher requires Railway publication transport v1 and runs a read-only
startup transaction against the target DB. It verifies database identity,
schema, role, workspace ownership, the active channel and the optional placement.
It opens the gateway only after these checks and both children are ready. It
runs no migration, scheduler, bot runtime, webhook or physical MTProto client.

Sign in through the production login screen. Only the configured owner's
session is admitted. The local API rechecks workspace ownership and exact
scope. For posts, open `/telegram-posts/<channel-id>/editor`. For a configured
deal, open `/ad-sales/sales?saleId=<sale-id>`. The deal view exposes the
selected placement, its content editor, publish and reconciliation.

### Supported actions

- Read the scoped post list, detail, revision history, groups and calendar.
  These reads use the local API and production DB. The operator calendar
  bypasses the internal cached calendar for this channel. Other permitted
  deployed GETs bypass the outer response cache for the operator request.
- Create/edit an ordinary draft or edit content on the configured unpublished
  placement with a draft or LOCAL schedule. Publish one ordinary draft or one
  LOCAL-scheduled post. Immediately reread the selected record or its channel
  calendar. The same publish handler serves JSON and NDJSON.
- Publish the configured Ad Sales placement through the canonical placement
  transition. A previously confirmed publication uses an exact-ID MTProto read
  and scoped reconciliation with no repeat send. Commercial edits, ad deal
  notifications and VP actions remain in the regular production workflow.
- Ask for explicit receipt reconciliation when cloud ACKs exist but local
  projection failed. The publisher verifies the stored actor and the hash of
  each rendered operation. It can project ACKs without issuing a new send.
  STARTED/UNKNOWN or incomplete/mismatched receipts require Telegram evidence.
  A crashed request can hold the reconciliation window for up to 90 seconds.
- The existing scoped native recovery plan, snapshot and selected-post
  recovery stream remain available. Native replacement requires the original
  sender, exact original schedule and Telegram cancellation ACK.
- Creation of a native schedule, remote edits, media uploads, bulk or group
  publication, arbitrary Telegram commands and other ad mutations are outside
  the operator flow. Publish supports text and existing photo/video URLs,
  including albums without buttons. The regular API exposes
  `POST /api/telegram-channels/:id/repair-post-groups` to an authenticated
  owner for explicit system-group repair. Group reads perform no repair.

### Edit, verify, release

1. Edit the local business service or formatter. Finish the current request,
   then press Ctrl+C and rerun the operator command. The old gateway and
   backend must stop before restart. A lost response keeps the post fenced
   across process restart. Read the journal and Telegram evidence before any
   reconciliation.
2. In the browser reopen the selected record. Check the ID and revision in
   the confirmation. Confirm only the prepared test publication in a private
   channel. Verify the recorded message IDs and rendered payload in Telegram,
   then reload the post/deal and calendar. Use a second private fixture for
   the independent Ad placement case. Cancel a confirmation and verify no
   request reaches the publisher.
3. Run typecheck, build and the focused publication, relay, cache and gateway
   tests. Follow the repository release gates and deploy through the normal
   Railway workflow. Validate the deployed version separately in live UI.
   After the one-time transport bootstrap, supported formatter and business
   edits are exercised with a local restart before that same code is deployed.

To add the next use case, trace the screen's authenticated requests and
choose one canonical application service. Admit exact routes and IDs through
the gateway and local workspace guard. Bind each Telegram operation to the
existing claim and journal. Extend the typed Railway transport only for a
required I/O operation, and add a scoped authoritative read and contention
test before admitting the action.

See [Codex production workflow](../production-codex-workflow.md) for release
dependencies and [publication reliability](../telegram/PUBLICATION_RELIABILITY.md)
for unknown outcomes and deadline regressions.
