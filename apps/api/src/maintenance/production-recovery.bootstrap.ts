import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { recoveryAuthorization } from '../telegram/shared/mtproto/production-recovery-relay-context';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { productionRecoveryConfig } from '../config/production-recovery-config';
import { ProductionRecoveryModule } from './production-recovery.module';

async function bootstrap() {
  const config = productionRecoveryConfig();
  const app = await NestFactory.create<NestExpressApplication>(
    ProductionRecoveryModule,
    { logger: false, abortOnError: false },
  );
  app.use((request: Request, _response: Response, next: NextFunction) =>
    recoveryAuthorization.run(request.headers.authorization ?? '', next),
  );
  app.useBodyParser('json', { limit: '8mb' });
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
