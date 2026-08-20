# API domain layout

- `identity`: authentication and the current-user account.
- `workspace`: workspaces and memberships.
- `finance`: accounts, currencies, exchange rates, categories, investments, transactions, and transfers.
- `growth`: advertising sources, campaigns, hypotheses, and promos.
- `telegram`: Telegram-facing products, channels, synchronization, bots, bot billing, and the system bot.
- `operations`: dashboards, logs, search, icons, prompt notes, and scheduled tasks.

Cross-domain infrastructure remains outside this directory: `common`, `prisma`, and `telegram/shared`.
