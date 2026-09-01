import { Injectable, Logger } from '@nestjs/common';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { TelegramCrmAutomationOccurrenceService } from '../telegram-crm/telegram-crm-automation-occurrence.service';

/** Ad Sales emits fresh business facts; CRM alone decides customer messaging. */
@Injectable()
export class TelegramAdSalesCustomerAutomationFactsService {
  private readonly logger = new Logger(
    TelegramAdSalesCustomerAutomationFactsService.name,
  );

  constructor(
    private readonly occurrences: TelegramCrmAutomationOccurrenceService,
  ) {}

  dealCreated(workspaceId: string, dealId: string, occurredAt = new Date()) {
    return this.safely('dealCreated', () =>
      this.occurrences.recordDealCreated(workspaceId, dealId, occurredAt),
    );
  }

  dealsCreated(
    workspaceId: string,
    dealIds: string[],
    occurredAt = new Date(),
  ) {
    return this.safely('dealsCreated', () =>
      this.occurrences.recordDealsCreated(workspaceId, dealIds, occurredAt),
    );
  }

  scheduleChanged(
    workspaceId: string,
    dealId: string,
    occurredAt = new Date(),
  ) {
    return this.safely('scheduleChanged', () =>
      this.occurrences.recordScheduleChanged(workspaceId, dealId, occurredAt),
    );
  }

  cancelled(workspaceId: string, dealId: string) {
    return this.safely('cancelled', () =>
      this.occurrences.recordCancellation(workspaceId, dealId),
    );
  }

  verifiedPublication(workspaceId: string, dealId: string) {
    return this.safely('verifiedPublication', () =>
      this.occurrences.recordVerifiedPublication(workspaceId, dealId),
    );
  }

  verifiedPublications(facts: Array<{ workspaceId: string; dealId: string }>) {
    return this.safely('verifiedPublications', () =>
      this.occurrences.recordVerifiedPublications(facts),
    );
  }

  private async safely<T>(action: string, operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      this.logger.error(
        `CRM customer automation fact ${action} failed: ${sanitizeOperationalError(error)}`,
      );
      return false;
    }
  }
}
