import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApplicationLoggerService } from './domains/operations/application-logs/application-logger.service';
import { corsOrigins } from './common/http/cors-origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(ApplicationLoggerService));

  const configService = app.get(ConfigService);

  const port = Number(process.env.PORT || configService.get<number>('API_PORT') || 4000);

  const frontendUrl = configService.get<string>('FRONTEND_URL');
  const financeMiniAppUrl = configService.get<string>('FINANCE_MINI_APP_URL');

  const allowedOrigins = corsOrigins(
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4000',
    frontendUrl,
    financeMiniAppUrl,
  );

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Workspace-Id',
      'X-Telegram-Init-Data',
      'X-Finance-Consumer-Request',
      'X-Correlation-Id',
      'X-Bypass-Response-Cache',
      'Cache-Control',
      'Pragma',
      'ngrok-skip-browser-warning',
    ],
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
