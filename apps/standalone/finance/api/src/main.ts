import { FinanceRuntimeConfig } from './config/finance-runtime-config';
import { createFinanceApp } from './create-finance-app';

async function bootstrap() {
  const app = await createFinanceApp();
  app.enableShutdownHooks();

  const config = app.get(FinanceRuntimeConfig);
  await app.listen(config.port, '0.0.0.0');
  process.stdout.write(
    `[finance-api] Ready on http://localhost:${config.port}/api (health: /api/health)\n`,
  );
}

void bootstrap();
