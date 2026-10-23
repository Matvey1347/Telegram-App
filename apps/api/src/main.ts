import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ApplicationLoggerService } from './domains/operations/application-logs/application-logger.service';
import {
  apiCorsAllowedHeaders,
  corsOrigins,
  webCorsOrigins,
} from './common/http/cors-origins';
import {
  apiPort,
  configuredRuntimeEnvironmentName,
  publicWebOrigin,
  trustedProxyHops,
} from './config/deployment-config';
import { installDevelopmentConnectionDrain } from './common/http/development-connection-drain';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  // Unified post imports contain up to 100 posts with their text and media
  // references. Nest's default JSON parser limit (100 KB) rejects these before
  // DTO validation or the import preview handler can run.
  (app as NestExpressApplication).useBodyParser('json', { limit: '8mb' });
  installDevelopmentConnectionDrain(
    app.getHttpServer(),
    configuredRuntimeEnvironmentName(),
  );
  app.enableShutdownHooks();
  app.useLogger(app.get(ApplicationLoggerService));

  const proxyHops = trustedProxyHops();
  if (proxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', proxyHops);
  }

  const port = apiPort();
  const frontendUrl = publicWebOrigin();

  const allowedOrigins = corsOrigins(
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4000',
    ...webCorsOrigins(frontendUrl),
  );

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: apiCorsAllowedHeaders,
    exposedHeaders: ['X-Correlation-Id'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(port, '0.0.0.0');
  process.stdout.write(
    `[api] Ready on http://localhost:${port}/api (health: /api/health)\n`,
  );
}

bootstrap();
