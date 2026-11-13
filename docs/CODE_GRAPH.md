# Code Knowledge Graph

This repository uses the official [Graphify](https://github.com/Graphify-Labs/graphify) CLI (`graphifyy` on PyPI). Graphify extracts code relationships locally with tree-sitter and writes the graph, report, and its standard interactive force-directed visualization into the ignored `graphify-out/` directory.

## Install and build

Install the CLI once with `uv`:

```sh
uv tool install 'graphifyy[watch]'
```

Build or refresh the graph from the repository root:

```sh
pnpm graph build
```

The generated files are:

- `graphify-out/graph.html` — Graphify's built-in interactive visualization with search, community filters, and node inspection.
- `graphify-out/graph.json` — the graph used by the CLI and local MCP server.
- `graphify-out/GRAPH_REPORT.md` — a readable summary of detected communities and connections.

The output stays on this machine and is ignored by Git. Code extraction runs locally and does not require an LLM API key. Graphify also supports semantic extraction for documents and media, but this project integration builds the code graph.

## Open the visualization

Open `graphify-out/graph.html` directly in a browser, or serve the exact same generated file on localhost:

```sh
pnpm graph serve
```

Then open [http://localhost:8000](http://localhost:8000). This helper only serves Graphify's generated HTML; it contains no separate graph renderer. Set `GRAPH_PORT=8001` if port 8000 is occupied. Stop the server with Ctrl+C.

## Keep it current

Run a one-time incremental refresh after code changes with `pnpm graph update`. To update automatically while editing, leave the native Graphify watcher running in a terminal:

```sh
pnpm graph watch
```

Graphify debounces file changes and refreshes `graph.json`, `graph.html`, and the report for code changes. Stop the watcher with Ctrl+C. The watcher is a local development process; it is not part of the API or web runtime. The watcher does not perform semantic re-extraction of changed documents/media.

After a refactor that removes many symbols, use `pnpm graph update --force` so Graphify can shrink the stored graph to match the source.

## Use the graph in Codex

The official project-scoped Graphify skill is installed at `.codex/skills/graphify/`; reload the project in Codex for the `/graphify` skill and MCP tools to appear. The project MCP server in `.codex/config.toml` reads `graphify-out/graph.json`. For routine code questions, query the graph first when the task involves unfamiliar modules, architecture, callers, or cross-file flow; then confirm details in source and tests. Use `pnpm graph update` for routine refreshes; `/graphify .` runs Graphify's full skill workflow.

Useful local CLI examples:

```sh
pnpm graph query "how does Telegram post scheduling reach persistence?"
pnpm graph explain "TelegramChannelService"
pnpm graph path "TelegramChannelService" "PrismaService"
```

Graph edges include extracted and inferred relationships. Treat them as navigation evidence, not proof of runtime behavior, authorization, or every dynamic call.

## Boundaries

- Index repository source and documentation only; do not connect the graph to production data.
- Do not add Graphify indexing, the watcher, an MCP process, or polling to API/web runtime services.
- Graphify obeys repository ignore rules. Keep credentials, local databases, dependencies, and generated output ignored.

## References

- [Graphify official repository and CLI](https://github.com/Graphify-Labs/graphify)
- [Graphify documentation](https://docs.graphify.com/)
- [Graphify interactive HTML overview](https://graphify.com/blog/how-to-visualize-a-codebase-as-a-graph)
