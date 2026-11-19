import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiCorsAllowedHeaders } from '../common/http/cors-origins';
import { productionRecoveryConfig } from '../config/production-recovery-config';
import { ProductionRecoveryModule } from './production-recovery.module';

async function bootstrap() {
  const config = productionRecoveryConfig();
  const app = await NestFactory.create<NestExpressApplication>(
    ProductionRecoveryModule,
    { logger: false },
  );
  app.use(
    (
      request: {
        method: string;
        url: string;
        headers: Record<string, unknown>;
      },
      response: {
        statusCode: number;
        once(event: string, callback: () => void): void;
      },
      next: () => void,
    ) => {
      response.once('finish', () => {
        if (response.statusCode >= 400)
          process.stdout.write(
            JSON.stringify({
              event: 'local_recovery_http_error',
              method: request.method,
              path: request.url.split('?')[0],
              status: response.statusCode,
              hasAuthorization: Boolean(request.headers.authorization),
            }) + '\n',
          );
      });
      next();
    },
  );
  app.useBodyParser('json', { limit: '8mb' });
  app.enableCors({
    origin: [
      `http://localhost:${config.webPort}`,
      `http://127.0.0.1:${config.webPort}`,
    ],
    credentials: true,
    allowedHeaders: [...apiCorsAllowedHeaders],
    methods: ['GET', 'POST', 'OPTIONS'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(config.apiPort, '127.0.0.1');
  process.stdout.write(
    `[production-recovery] Local scoped API ready on port ${config.apiPort}; background workers are not loaded.\n`,
  );
}

void bootstrap().catch(() => {
  // Config/database/transport errors may contain credentials. Never dump them.
  process.stderr.write('[production-recovery] Local API startup failed.\n');
  process.exitCode = 1;
});
