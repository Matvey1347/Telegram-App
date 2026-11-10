# Local development database

Nexeloq development uses the Docker PostgreSQL 18 container on `localhost:5433`.
The older `telegram_system_postgres_data` volume is intentionally left in place;
the new container has its own `telegram_system_postgres18_data` volume.

The ignored root `.env` keeps the production connection as
`DATABASE_URL_PRODUCTION`; `DATABASE_URL` points to Docker. Do not copy the
production URL into `DATABASE_URL` for ordinary development. The local web app
shows a `LOCAL DATABASE` badge and uses the local API on port 4000.

To start the database and app:

```sh
pnpm db:up
pnpm dev:nexeloq
```

To deliberately replace the local database with a fresh full production
snapshot, set `ALLOW_PRODUCTION_SNAPSHOT=YES` for the command:

```sh
ALLOW_PRODUCTION_SNAPSHOT=YES pnpm db:snapshot:refresh
```

This uses PostgreSQL 18 `pg_dump`/`pg_restore`, drops/recreates local objects,
and does not write to production. It will replace local-only data. Production
credentials must be stored only in the ignored `.env` file. Never commit that
file or the resulting database contents.

Schema changes are developed against the Docker database and committed as
Prisma migrations. Production migrations run only in Railway's deployment
pre-deploy step (`pnpm db:deploy:safe`); local commands must not target
`DATABASE_URL_PRODUCTION`.
