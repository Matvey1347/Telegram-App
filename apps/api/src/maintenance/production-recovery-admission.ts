import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { productionRecoveryConfig } from '../config/production-recovery-config';

@Injectable()
export class ProductionRecoveryAdmission implements CanActivate {
  canActivate(context: ExecutionContext) {
    const config = productionRecoveryConfig();
    const req = context.switchToHttp().getRequest<Request>();
    const capability = req.headers['x-local-operator-capability'];
    const authorization = req.headers.authorization;
    if (
      typeof capability !== 'string' ||
      !/^[0-9a-f]{64}$/.test(capability) ||
      !timingSafeEqual(
        Buffer.from(capability),
        Buffer.from(config.capability),
      ) ||
      req.headers['x-workspace-id'] !== config.workspaceId ||
      !authorization
    ) {
      throw new ForbiddenException('Production operator admission required');
    }
    Reflect.set(req, 'user', { sub: config.userId });
    return true;
  }
}
