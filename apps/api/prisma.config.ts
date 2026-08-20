import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

config({
  path: '../../.env',
  // Explicit deployment/test environment variables must take precedence.
  // Overriding them here can silently point Prisma commands at another database.
  override: false,
});

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
