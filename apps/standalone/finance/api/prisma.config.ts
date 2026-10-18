import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { resolve } from 'node:path';

const financeProductRoot = resolve(__dirname, '..', '..', '..', '..', 'products', 'finance');

// Explicit shell and Railway variables win. These files are deliberately
// scoped to the Finance product: tooling must never load the Nexeloq root env.
config({ path: resolve(financeProductRoot, '.env.local'), override: false });
config({ path: resolve(financeProductRoot, '.env'), override: false });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Generation and static schema validation must work without a developer's
    // database credential. A deploy command still receives the real value
    // from Railway or the dedicated local profile; this inert endpoint cannot
    // connect or accidentally select Nexeloq's database.
    url:
      process.env.FINANCE_DATABASE_URL ??
      'postgresql://finance:unconfigured@127.0.0.1:1/finance',
  },
});
