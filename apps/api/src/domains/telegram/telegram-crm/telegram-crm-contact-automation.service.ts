import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrmContactAutomationSettings } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { validateCrmAutomationTypeOverrides } from './telegram-crm-automation-input';
import { TelegramCrmAutomationOccurrenceService } from './telegram-crm-automation-occurrence.service';
import { UpdateCrmContactAutomationDto } from './telegram-crm.dto';

const contactAutomationSelect = {
  id: true,
  automatedMessagesEnabled: true,
  automatedMessagesEnabledAt: true,
  automationLocale: true,
  prePublicationAutomationOverride: true,
  prePublicationAutomationEnabledAt: true,
  publishedLinksAutomationOverride: true,
  publishedLinksAutomationEnabledAt: true,
  followUpAutomationOverride: true,
  followUpAutomationEnabledAt: true,
} satisfies Prisma.TelegramAdvertiserSelect;

type ContactRow = Prisma.TelegramAdvertiserGetPayload<{
  select: typeof contactAutomationSelect;
}>;

@Injectable()
export class TelegramCrmContactAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly occurrences: TelegramCrmAutomationOccurrenceService,
  ) {}

  async update(
    userId: string,
    contactId: string,
    dto: UpdateCrmContactAutomationDto,
  ): Promise<CrmContactAutomationSettings> {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.manageAutomation',
    );
    const current = await this.prisma.telegramAdvertiser.findFirst({
      where: { id: contactId, workspaceId: access.workspaceId },
      select: { ...contactAutomationSelect, ownerMemberId: true },
    });
    if (!current) throw new NotFoundException('CRM Contact not found');
    await this.authorization.requireOwnOrAny(
      userId,
      { assignedMemberId: current.ownerMemberId },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
    const overrides = validateCrmAutomationTypeOverrides(dto.typeOverrides);
    const now = new Date();
    const data: Prisma.TelegramAdvertiserUpdateInput = {};
    if (dto.enabled !== undefined) {
      data.automatedMessagesEnabled = dto.enabled;
      data.automatedMessagesEnabledAt = dto.enabled
        ? current.automatedMessagesEnabled && current.automatedMessagesEnabledAt
          ? current.automatedMessagesEnabledAt
          : now
        : null;
    }
    if (dto.locale !== undefined) data.automationLocale = dto.locale;
    this.assignOverride(
      data,
      overrides.PRE_PUBLICATION_REMINDER,
      current.prePublicationAutomationOverride,
      'prePublicationAutomationOverride',
      'prePublicationAutomationEnabledAt',
      now,
    );
    this.assignOverride(
      data,
      overrides.PUBLISHED_LINKS,
      current.publishedLinksAutomationOverride,
      'publishedLinksAutomationOverride',
      'publishedLinksAutomationEnabledAt',
      now,
    );
    this.assignOverride(
      data,
      overrides.FOLLOW_UP,
      current.followUpAutomationOverride,
      'followUpAutomationOverride',
      'followUpAutomationEnabledAt',
      now,
    );
    if (!Object.keys(data).length)
      throw new BadRequestException('No automation changes');
    const updated = await this.prisma.telegramAdvertiser.update({
      where: { id: current.id },
      data,
      select: contactAutomationSelect,
    });
    if (dto.enabled === false) {
      await this.occurrences.cancelContact(access.workspaceId, contactId);
    } else {
      for (const [type, override] of Object.entries(overrides)) {
        if (override === 'DISABLED') {
          await this.occurrences.cancelContactType(
            access.workspaceId,
            contactId,
            type as
              | 'PRE_PUBLICATION_REMINDER'
              | 'PUBLISHED_LINKS'
              | 'FOLLOW_UP',
            `CONTACT_${type}_DISABLED`,
          );
        }
      }
    }
    return this.map(updated);
  }

  private assignOverride(
    data: Prisma.TelegramAdvertiserUpdateInput,
    value: 'INHERIT' | 'ENABLED' | 'DISABLED' | undefined,
    current: 'INHERIT' | 'ENABLED' | 'DISABLED',
    overrideKey:
      | 'prePublicationAutomationOverride'
      | 'publishedLinksAutomationOverride'
      | 'followUpAutomationOverride',
    enabledAtKey:
      | 'prePublicationAutomationEnabledAt'
      | 'publishedLinksAutomationEnabledAt'
      | 'followUpAutomationEnabledAt',
    now: Date,
  ) {
    if (value === undefined || value === current) return;
    data[overrideKey] = value;
    data[enabledAtKey] = now;
  }

  private map(row: ContactRow): CrmContactAutomationSettings {
    return {
      contactId: row.id,
      enabled: row.automatedMessagesEnabled,
      enabledAt: row.automatedMessagesEnabledAt?.toISOString() ?? null,
      locale:
        row.automationLocale === 'ru' || row.automationLocale === 'uk'
          ? row.automationLocale
          : row.automationLocale === 'en'
            ? 'en'
            : null,
      typeOverrides: {
        PRE_PUBLICATION_REMINDER: {
          override: row.prePublicationAutomationOverride,
          enabledAt:
            row.prePublicationAutomationEnabledAt?.toISOString() ?? null,
        },
        PUBLISHED_LINKS: {
          override: row.publishedLinksAutomationOverride,
          enabledAt:
            row.publishedLinksAutomationEnabledAt?.toISOString() ?? null,
        },
        FOLLOW_UP: {
          override: row.followUpAutomationOverride,
          enabledAt: row.followUpAutomationEnabledAt?.toISOString() ?? null,
        },
      },
    };
  }
}
