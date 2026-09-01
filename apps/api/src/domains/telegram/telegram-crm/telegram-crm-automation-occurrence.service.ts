import { Injectable } from '@nestjs/common';
import { Prisma, TelegramCrmCustomerAutomationType } from '@prisma/client';
import type { CrmCustomerAutomationType } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { notifyScheduledTaskDueWorkChanged } from '../../operations/scheduled-tasks/scheduled-task-wake-notifier';
import { TelegramCrmAutomationPolicyService } from './telegram-crm-automation-policy.service';
import {
  buildCrmPrePublicationOccurrence,
  buildCrmPublishedLinksOccurrence,
  type CrmAutomationOccurrenceParams as OccurrenceParams,
  materializeCrmAutomationOccurrence,
} from './telegram-crm-automation-materialization';
import { crmAutomationSaleSelect as saleSelect } from './telegram-crm-automation-sale';
import { isPrismaUniqueConflict } from './telegram-crm-prisma-errors';

export const CRM_AUTOMATION_DUE_TASK_KEY = 'telegram_crm.customer_automations';

@Injectable()
export class TelegramCrmAutomationOccurrenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TelegramCrmAutomationPolicyService,
  ) {}

  async recordDealCreated(
    workspaceId: string,
    dealId: string,
    occurredAt = new Date(),
  ) {
    const changed = await this.refreshPrePublication(
      workspaceId,
      dealId,
      occurredAt,
      false,
    );
    if (changed) this.notify();
  }

  async recordDealsCreated(
    workspaceId: string,
    dealIds: string[],
    occurredAt = new Date(),
  ) {
    const ids = [...new Set(dealIds)].slice(0, 500);
    if (!ids.length) return;
    const sales = await this.prisma.telegramAdSale.findMany({
      where: { workspaceId, id: { in: ids } },
      select: saleSelect,
    });
    const data = sales
      .map((sale) => buildCrmPrePublicationOccurrence(sale, occurredAt))
      .map((params) =>
        params ? materializeCrmAutomationOccurrence(this.policy, params) : null,
      )
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    if (!data.length) return;
    const created =
      await this.prisma.telegramCrmCustomerAutomationExecution.createMany({
        data,
        skipDuplicates: true,
      });
    if (created.count) this.notify();
  }

  async recordScheduleChanged(
    workspaceId: string,
    dealId: string,
    occurredAt = new Date(),
  ) {
    const changed = await this.refreshPrePublication(
      workspaceId,
      dealId,
      occurredAt,
      true,
    );
    if (changed) this.notify();
  }

  async recordCancellation(workspaceId: string, dealId: string) {
    return this.cancelWhere(
      { workspaceId, telegramAdSaleId: dealId },
      'SCHEDULE_CANCELLED',
    );
  }

  async cancelType(
    workspaceId: string,
    dealId: string,
    automationType: CrmCustomerAutomationType,
    reason = 'AUTOMATION_DISABLED',
  ) {
    return this.cancelWhere(
      { workspaceId, telegramAdSaleId: dealId, automationType },
      reason,
    );
  }

  async cancelContact(
    workspaceId: string,
    contactId: string,
    reason = 'CONTACT_DISABLED',
  ) {
    return this.cancelWhere({ workspaceId, contactId }, reason);
  }

  async cancelWorkspace(workspaceId: string, reason = 'WORKSPACE_DISABLED') {
    return this.cancelWhere({ workspaceId }, reason);
  }

  async cancelWorkspaceType(
    workspaceId: string,
    automationType: CrmCustomerAutomationType,
    reason = 'WORKSPACE_TYPE_DISABLED',
  ) {
    return this.cancelWhere({ workspaceId, automationType }, reason);
  }

  async cancelContactType(
    workspaceId: string,
    contactId: string,
    automationType: CrmCustomerAutomationType,
    reason = 'CONTACT_TYPE_DISABLED',
  ) {
    return this.cancelWhere({ workspaceId, contactId, automationType }, reason);
  }

  private async cancelWhere(
    where: Prisma.TelegramCrmCustomerAutomationExecutionWhereInput,
    reason: string,
  ) {
    const result =
      await this.prisma.telegramCrmCustomerAutomationExecution.updateMany({
        where: {
          ...where,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
          reason,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
        },
      });
    if (result.count) this.notify();
    return result.count > 0;
  }

  async recordVerifiedPublication(
    workspaceId: string,
    dealId: string,
    notify = true,
  ) {
    const sale = await this.loadSale(workspaceId, dealId);
    const params = sale ? buildCrmPublishedLinksOccurrence(sale) : null;
    const changed = params ? await this.createOrUpdate(params) : false;
    if (changed && notify) this.notify();
    return changed;
  }

  async recordVerifiedPublications(
    facts: Array<{ workspaceId: string; dealId: string }>,
  ) {
    const unique = new Map(
      facts.map((fact) => [`${fact.workspaceId}\0${fact.dealId}`, fact]),
    );
    const byWorkspace = new Map<string, string[]>();
    for (const fact of [...unique.values()].slice(0, 500)) {
      const ids = byWorkspace.get(fact.workspaceId) ?? [];
      ids.push(fact.dealId);
      byWorkspace.set(fact.workspaceId, ids);
    }
    let changed = false;
    for (const [workspaceId, ids] of byWorkspace) {
      const sales = await this.prisma.telegramAdSale.findMany({
        where: { workspaceId, id: { in: ids } },
        select: saleSelect,
      });
      const data = sales
        .map((sale) => buildCrmPublishedLinksOccurrence(sale))
        .map((params) =>
          params
            ? materializeCrmAutomationOccurrence(this.policy, params)
            : null,
        )
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
      if (!data.length) continue;
      const created =
        await this.prisma.telegramCrmCustomerAutomationExecution.createMany({
          data,
          skipDuplicates: true,
        });
      changed = created.count > 0 || changed;
    }
    if (changed) this.notify();
    return changed;
  }

  async recordFollowUpConfigured(
    workspaceId: string,
    dealId: string,
    occurredAt = new Date(),
  ) {
    const sale = await this.loadSale(workspaceId, dealId);
    if (!sale?.advertiser) return false;
    if (!sale.customerFollowUpAt) {
      const cancelled =
        await this.prisma.telegramCrmCustomerAutomationExecution.updateMany({
          where: {
            workspaceId,
            telegramAdSaleId: dealId,
            automationType: TelegramCrmCustomerAutomationType.FOLLOW_UP,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          data: {
            status: 'CANCELLED',
            completedAt: occurredAt,
            reason: 'FOLLOW_UP_CLEARED',
            leaseOwner: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
          },
        });
      if (cancelled.count) this.notify();
      return cancelled.count > 0;
    }
    const changed = await this.createOrUpdate({
      sale,
      automationType: 'FOLLOW_UP',
      eventKey: `deal:${sale.id}:follow-up:${sale.customerFollowUpVersion}`,
      eventOccurredAt: occurredAt,
      dueAt: sale.customerFollowUpAt,
      sourceVersion: String(sale.customerFollowUpVersion),
    });
    if (changed) this.notify();
    return changed;
  }

  async recordExplicitLegacyEnable(
    workspaceId: string,
    dealId: string,
    occurredAt = new Date(),
  ) {
    const prePublication = await this.refreshPrePublication(
      workspaceId,
      dealId,
      occurredAt,
      true,
    );
    const followUp = await this.recordFollowUpConfigured(
      workspaceId,
      dealId,
      occurredAt,
    );
    if (prePublication && !followUp) this.notify();
    return prePublication || followUp;
  }

  private async refreshPrePublication(
    workspaceId: string,
    dealId: string,
    eventOccurredAt: Date,
    cancelWhenUnavailable: boolean,
  ) {
    const sale = await this.loadSale(workspaceId, dealId);
    const params = sale
      ? buildCrmPrePublicationOccurrence(sale, eventOccurredAt)
      : null;
    if (!params) {
      if (cancelWhenUnavailable) {
        await this.cancelType(
          workspaceId,
          dealId,
          'PRE_PUBLICATION_REMINDER',
          'SCHEDULE_CANCELLED',
        );
      }
      return false;
    }
    return this.createOrUpdate(params);
  }

  private async createOrUpdate(params: OccurrenceParams) {
    const materialized = materializeCrmAutomationOccurrence(
      this.policy,
      params,
    );
    if (!materialized) return false;
    const { sale } = params;
    const existing =
      await this.prisma.telegramCrmCustomerAutomationExecution.findUnique({
        where: {
          workspaceId_automationType_eventKey: {
            workspaceId: sale.workspaceId,
            automationType: params.automationType,
            eventKey: params.eventKey,
          },
        },
        select: { id: true, status: true, sourceVersion: true },
      });
    if (existing && ['SENT', 'SENDING', 'FAILED'].includes(existing.status)) {
      return false;
    }
    if (existing) {
      const refreshed =
        await this.prisma.telegramCrmCustomerAutomationExecution.updateMany({
          where: {
            id: existing.id,
            status: existing.status,
            sourceVersion: existing.sourceVersion,
          },
          data: {
            ...materialized,
            status: 'PENDING',
            attempts: 0,
            attemptedAt: null,
          },
        });
      return refreshed.count === 1;
    }
    try {
      await this.prisma.telegramCrmCustomerAutomationExecution.create({
        data: materialized,
      });
      return true;
    } catch (error) {
      if (isPrismaUniqueConflict(error)) return false;
      throw error;
    }
  }

  private loadSale(workspaceId: string, dealId: string) {
    return this.prisma.telegramAdSale.findFirst({
      where: { id: dealId, workspaceId },
      select: saleSelect,
    });
  }

  private notify() {
    notifyScheduledTaskDueWorkChanged(CRM_AUTOMATION_DUE_TASK_KEY);
  }
}
