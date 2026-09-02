import { Injectable } from '@nestjs/common';
import type { OperationsNotificationType, Prisma } from '@prisma/client';

export type OperationsNotificationDueFact = {
  id: string;
  workspaceId: string;
  type: OperationsNotificationType;
  recipientMemberId: string;
  visibilityMemberId: string | null;
  visibilityResourceKey: string | null;
};

type Resolver = (
  tx: Prisma.TransactionClient,
  facts: readonly OperationsNotificationDueFact[],
) => Promise<boolean>;

@Injectable()
export class OperationsNotificationDueResolutionService {
  private resolver: Resolver | null = null;

  register(resolver: Resolver) {
    if (this.resolver) {
      throw new Error('Operations notification due resolver is already set');
    }
    this.resolver = resolver;
    return () => {
      if (this.resolver === resolver) this.resolver = null;
    };
  }

  resolve(
    tx: Prisma.TransactionClient,
    facts: readonly OperationsNotificationDueFact[],
  ) {
    return this.resolver?.(tx, facts) ?? Promise.resolve(false);
  }
}
