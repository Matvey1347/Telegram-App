# Repository scripts

Run the documented `pnpm` commands with Node from `.nvmrc` and pnpm from
`package.json`. From another directory, use `cd /path/to/Telegram-App` before
running pnpm so Corepack selects the repository's pinned version.

| Directory | Responsibilities and entry points |
| --- | --- |
| [dev](dev/) | Product launchers, port/readiness checks, supervisor, local DB guard and the production-operator gateway. Use `pnpm dev:local`, `pnpm dev:all`, `pnpm dev:stop` or the [development workflows](../docs/setup/LOCAL_PRODUCTION_WORKFLOWS.md). |
| [deployment](deployment/) | Railway process supervisor, memory diagnostics and build artifact checks. CI invokes `pnpm test:deployment` and checks artifacts in the jobs that built them. |
| [db](db/) | Local snapshot workflow and CRM migration audit. Snapshot refresh requires its existing confirmation and AI synchronization guards. |
| [production](production/) | Explicit, scoped production operator commands and the publication smoke entry point. Follow the [production workflows](../docs/production-codex-workflow.md). |
| [quality](quality/) | Architecture, i18n, environment and change checks and the local graph command. |
| [ai](ai/) | Local AI expense sync and the pre-push hook regression. The release workflow performs a dry run, an execution run, and the release check. |
| [qa](qa/) | CRM benchmarks and lead-review tooling. Lead review checks use synthetic fixtures. Research CLIs that need the existing local corpus run from the repository root. |
| [build](build/) | Finance asset preparation and the [source ZIP](../docs/setup/SOURCE_ARCHIVE.md). |

The root retains direct CLI wrappers used in the CRM benchmark, lead-review,
migration audit and publication smoke instructions. The implementations and
tests live in their owning directories. See the [consumer inventory](../docs/refactoring/SCRIPTS_INVENTORY.md) for former paths.

`pnpm test:deployment` covers launcher and Railway contracts.
`pnpm test:tooling` covers offline QA, compatibility entry points, AI hook
behavior and archive filtering. Neither command exports production research data.
