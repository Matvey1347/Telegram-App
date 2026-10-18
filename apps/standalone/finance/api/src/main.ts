import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FinanceApiModule } from './finance-api.module';
import { FinanceRuntimeConfig } from './config/finance-runtime-config';

async function bootstrap() {
  const app = await NestFactory.create(FinanceApiModule, { rawBody: true });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = app.get(FinanceRuntimeConfig);
  await app.listen(config.port, '0.0.0.0');
  process.stdout.write(
    `[finance-api] Ready on http://localhost:${config.port}/api (health: /api/health)\n`,
  );
}

void bootstrap();
