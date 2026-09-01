import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CrmAutomationEligibility,
  CrmCustomerAutomationType,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CrmAutomationExecutionRow as ExecutionRow,
  crmAutomationExecutionSelect as executionSelect,
} from './telegram-crm-automation-execution';
import { TelegramCrmAutomationPolicyService } from './telegram-crm-automation-policy.service';
import {
  crmAutomationSourceFingerprint,
  crmPublishedPlacementSource,
} from './telegram-crm-automation-source';

export type CrmAutomationPinnedTarget = {
  conversationId: string;
  mtprotoAccountId: string;
};

export type CrmAutomationAuthorizationResult =
  | { kind: 'READY'; execution: ExecutionRow }
  | { kind: 'DENIED'; reason: string; execution: ExecutionRow | null }
  | { kind: 'LOST' };

/**
 * Establishes the durable point of no return for one customer send.
 * Source and gate rows are share-locked while the execution is atomically
 * moved to SENDING, so a mutation that commits first is observed and a
 * mutation that waits commits only after this logical send was authorized.
 */
@Injectable()
export class TelegramCrmAutomationAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TelegramCrmAutomationPolicyService,
  ) {}

  preflight(execution: ExecutionRow) {
    if (execution.sale?.status === 'CANCELLED') {
      return { allowed: false, reason: 'DEAL_CANCELLED' } as const;
    }
    return this.evaluate(execution, true, true, false);
  }

  sourceStillCurrent(execution: ExecutionRow) {
    const sale = execution.sale!;
    if (sale.status === 'CANCELLED') return false;
    if (execution.automationType === 'FOLLOW_UP') {
      return (
        sale.customerFollowUpAt !== null &&
        String(sale.customerFollowUpVersion) === execution.sourceVersion &&
        execution.eventKey ===
          `deal:${execution.telegramAdSaleId}:follow-up:${sale.customerFollowUpVersion}`
      );
    }
    if (execution.automationType === 'PRE_PUBLICATION_REMINDER') {
      const placements = sale.placements.filter(
        (placement) =>
          placement.scheduledAt > new Date() &&
          !['PUBLISHED', 'COMPLETED', 'CANCELLED', 'MISSED'].includes(
            placement.status,
          ),
      );
      if (!placements.length) return false;
      return (
        execution.sourceVersion ===
        crmAutomationSourceFingerprint(
          placements.map((placement) => ({
            id: placement.id,
            status: placement.status,
            scheduledAt: placement.scheduledAt.toISOString(),
            timezone: placement.timezone,
            channelTitle: placement.telegramChannel.title,
          })),
        )
      );
    }
    const source = crmPublishedPlacementSource(sale);
    return Boolean(source && execution.sourceVersion === source.sourceVersion);
  }

  authorize(
    expected: ExecutionRow,
    ownerId: string,
    target: CrmAutomationPinnedTarget,
  ): Promise<CrmAutomationAuthorizationResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id"
          FROM "TelegramCrmCustomerAutomationExecution"
          WHERE "id" = ${expected.id}
            AND "leaseOwner" = ${ownerId}
            AND "status" = 'PROCESSING'::"TelegramCrmCustomerAutomationExecutionStatus"
          FOR UPDATE
        `);
        if (!locked.length || !expected.telegramAdSaleId) {
          return { kind: 'LOST' } as const;
        }

        await this.lockSafetyRows(tx, expected, target);
        const fresh = await tx.telegramCrmCustomerAutomationExecution.findFirst(
          {
            where: {
              id: expected.id,
              workspaceId: expected.workspaceId,
              contactId: expected.contactId,
              telegramAdSaleId: expected.telegramAdSaleId,
              conversationId: target.conversationId,
              mtprotoAccountId: target.mtprotoAccountId,
              leaseOwner: ownerId,
              status: 'PROCESSING',
            },
            select: executionSelect,
          },
        );
        if (!fresh?.sale || !fresh.telegramAdSaleId) {
          return {
            kind: 'DENIED',
            reason: 'DEAL_NOT_ELIGIBLE',
            execution: fresh,
          } as const;
        }
        if (fresh.sale.status === 'CANCELLED') {
          return {
            kind: 'DENIED',
            reason: 'DEAL_CANCELLED',
            execution: fresh,
          } as const;
        }
        const [conversation, account] = await Promise.all([
          tx.telegramCrmConversation.findFirst({
            where: {
              id: target.conversationId,
              workspaceId: fresh.workspaceId,
              contactId: fresh.contactId,
              mtprotoAccountId: target.mtprotoAccountId,
              state: 'ACTIVE',
            },
            select: { id: true },
          }),
          tx.telegramUserAccountIntegration.findFirst({
            where: {
              id: target.mtprotoAccountId,
              workspaceId: fresh.workspaceId,
              crmSendEnabled: true,
              isActive: true,
              status: 'connected',
              sessionEncrypted: { not: null },
              sessionIv: { not: null },
              sessionAuthTag: { not: null },
            },
            select: { id: true },
          }),
        ]);
        const eligibility = this.evaluate(
          fresh,
          Boolean(conversation),
          Boolean(account),
        );
        if (!eligibility.allowed) {
          return {
            kind: 'DENIED',
            reason: eligibility.reason,
            execution: fresh,
          } as const;
        }
        if (!this.sourceStillCurrent(fresh)) {
          return {
            kind: 'DENIED',
            reason: 'SOURCE_FACT_CHANGED',
            execution: fresh,
          } as const;
        }
        const sending =
          await tx.telegramCrmCustomerAutomationExecution.updateMany({
            where: {
              id: fresh.id,
              workspaceId: fresh.workspaceId,
              telegramAdSaleId: fresh.telegramAdSaleId,
              conversationId: target.conversationId,
              mtprotoAccountId: target.mtprotoAccountId,
              leaseOwner: ownerId,
              status: 'PROCESSING',
              sourceVersion: fresh.sourceVersion,
            },
            data: { status: 'SENDING' },
          });
        return sending.count === 1
          ? ({ kind: 'READY', execution: fresh } as const)
          : ({ kind: 'LOST' } as const);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async lockSafetyRows(
    tx: Prisma.TransactionClient,
    execution: ExecutionRow,
    target: CrmAutomationPinnedTarget,
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "workspaceId" FROM "TelegramAdCrmWorkspaceSettings"
      WHERE "workspaceId" = ${execution.workspaceId} FOR SHARE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "TelegramAdvertiser"
      WHERE "id" = ${execution.contactId}
        AND "workspaceId" = ${execution.workspaceId} FOR SHARE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "TelegramAdSale"
      WHERE "id" = ${execution.telegramAdSaleId!}
        AND "workspaceId" = ${execution.workspaceId} FOR SHARE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "TelegramAdSalePlacement"
      WHERE "telegramAdSaleId" = ${execution.telegramAdSaleId!}
        AND "workspaceId" = ${execution.workspaceId}
      ORDER BY "id" FOR SHARE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT channel."id"
      FROM "TelegramChannel" channel
      INNER JOIN "TelegramAdSalePlacement" placement
        ON placement."telegramChannelId" = channel."id"
      WHERE placement."telegramAdSaleId" = ${execution.telegramAdSaleId!}
        AND placement."workspaceId" = ${execution.workspaceId}
      ORDER BY channel."id" FOR SHARE OF channel
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT post."id"
      FROM "TelegramPost" post
      INNER JOIN "TelegramAdSalePlacement" placement
        ON placement."telegramPostId" = post."id"
      WHERE placement."telegramAdSaleId" = ${execution.telegramAdSaleId!}
        AND placement."workspaceId" = ${execution.workspaceId}
      ORDER BY post."id" FOR SHARE OF post
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "TelegramCrmConversation"
      WHERE "id" = ${target.conversationId}
        AND "workspaceId" = ${execution.workspaceId} FOR SHARE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "TelegramUserAccountIntegration"
      WHERE "id" = ${target.mtprotoAccountId}
        AND "workspaceId" = ${execution.workspaceId} FOR SHARE
    `);
  }

  private evaluate(
    execution: ExecutionRow,
    conversationValid: boolean,
    accountEnabled: boolean,
    requirePinnedEnvelope = true,
  ): CrmAutomationEligibility {
    const settings = execution.workspace.telegramAdCrmWorkspaceSettings;
    const contactType = this.contactType(execution, execution.automationType);
    const dealType = this.dealType(execution, execution.automationType);
    return this.policy.evaluate({
      workspaceId: execution.workspaceId,
      automationType: execution.automationType,
      workspace: {
        id: execution.workspaceId,
        enabled: settings?.customerTelegramAutomationsEnabled ?? false,
        enabledAt: settings?.customerTelegramAutomationsEnabledAt ?? null,
        typeEnabled: {
          PRE_PUBLICATION_REMINDER:
            settings?.prePublicationReminderEnabled ?? false,
          PUBLISHED_LINKS: settings?.publishedLinksEnabled ?? false,
          FOLLOW_UP: settings?.followUpEnabled ?? false,
        },
        typeEnabledAt: {
          PRE_PUBLICATION_REMINDER:
            settings?.prePublicationReminderEnabledAt ?? null,
          PUBLISHED_LINKS: settings?.publishedLinksEnabledAt ?? null,
          FOLLOW_UP: settings?.followUpEnabledAt ?? null,
        },
      },
      contact: {
        id: execution.contact.id,
        workspaceId: execution.contact.workspaceId,
        automatedMessagesEnabled: execution.contact.automatedMessagesEnabled,
        automatedMessagesEnabledAt:
          execution.contact.automatedMessagesEnabledAt,
        typeOverride: contactType.override,
        typeEnabledAt: contactType.enabledAt,
      },
      deal: {
        workspaceId: execution.sale!.workspaceId,
        contactId: execution.sale!.advertiserId,
        automationOverride: execution.sale!.customerAutomationOverride,
        automationEligibleAt: execution.sale!.customerAutomationEligibleAt,
        typeOverride: dealType.override,
        typeEnabledAt: dealType.enabledAt,
      },
      eventOccurredAt: execution.eventOccurredAt,
      historical: execution.historical,
      idempotencyKey: execution.eventKey,
      idempotencyConfirmed: true,
      conversationValid,
      accountCrmSendEnabled: accountEnabled,
      templateAvailable: Boolean(
        execution.renderedText &&
        execution.templateKey &&
        execution.locale &&
        (!requirePinnedEnvelope || execution.stableRandomId),
      ),
    });
  }

  private contactType(
    execution: ExecutionRow,
    type: CrmCustomerAutomationType,
  ) {
    if (type === 'PRE_PUBLICATION_REMINDER') {
      return {
        override: execution.contact.prePublicationAutomationOverride,
        enabledAt: execution.contact.prePublicationAutomationEnabledAt,
      };
    }
    if (type === 'PUBLISHED_LINKS') {
      return {
        override: execution.contact.publishedLinksAutomationOverride,
        enabledAt: execution.contact.publishedLinksAutomationEnabledAt,
      };
    }
    return {
      override: execution.contact.followUpAutomationOverride,
      enabledAt: execution.contact.followUpAutomationEnabledAt,
    };
  }

  private dealType(execution: ExecutionRow, type: CrmCustomerAutomationType) {
    const sale = execution.sale!;
    if (type === 'PRE_PUBLICATION_REMINDER') {
      return {
        override: sale.prePublicationAutomationOverride,
        enabledAt: sale.prePublicationAutomationEnabledAt,
      };
    }
    if (type === 'PUBLISHED_LINKS') {
      return {
        override: sale.publishedLinksAutomationOverride,
        enabledAt: sale.publishedLinksAutomationEnabledAt,
      };
    }
    return {
      override: sale.followUpAutomationOverride,
      enabledAt: sale.followUpAutomationEnabledAt,
    };
  }
}
