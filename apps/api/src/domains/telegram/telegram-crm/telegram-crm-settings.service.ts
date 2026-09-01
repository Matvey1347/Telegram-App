import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrmWorkspaceSettings } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmAccountAccessService } from './telegram-crm-account-access.service';
import { UpdateCrmWorkspaceSettingsDto } from './telegram-crm.dto';
import { TelegramCrmAutomationOccurrenceService } from './telegram-crm-automation-occurrence.service';

const settingsSelect = {
  workspaceId: true,
  defaultCrmSenderAccountId: true,
  customerTelegramAutomationsEnabled: true,
  customerTelegramAutomationsEnabledAt: true,
  automationLocale: true,
  prePublicationReminderEnabled: true,
  prePublicationReminderEnabledAt: true,
  publishedLinksEnabled: true,
  publishedLinksEnabledAt: true,
  followUpEnabled: true,
  followUpEnabledAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TelegramAdCrmWorkspaceSettingsSelect;

type SettingsRow = Prisma.TelegramAdCrmWorkspaceSettingsGetPayload<{
  select: typeof settingsSelect;
}>;
type SettingsChanges = Partial<
  Pick<
    SettingsRow,
    | 'defaultCrmSenderAccountId'
    | 'customerTelegramAutomationsEnabled'
    | 'customerTelegramAutomationsEnabledAt'
    | 'automationLocale'
    | 'prePublicationReminderEnabled'
    | 'prePublicationReminderEnabledAt'
    | 'publishedLinksEnabled'
    | 'publishedLinksEnabledAt'
    | 'followUpEnabled'
    | 'followUpEnabledAt'
  >
>;

@Injectable()
export class TelegramCrmSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly accountAccess: TelegramCrmAccountAccessService,
    @Optional()
    private readonly occurrences?: TelegramCrmAutomationOccurrenceService,
  ) {}

  async get(userId: string) {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const row = await this.prisma.telegramAdCrmWorkspaceSettings.findUnique({
      where: { workspaceId: access.workspaceId },
      select: settingsSelect,
    });
    return row ? this.map(row) : this.defaults(access.workspaceId);
  }

  async update(userId: string, dto: UpdateCrmWorkspaceSettingsDto) {
    const hasDefaultSender = dto.defaultCrmSenderAccountId !== undefined;
    const hasAutomation = [
      dto.customerTelegramAutomationsEnabled,
      dto.prePublicationReminderEnabled,
      dto.publishedLinksEnabled,
      dto.followUpEnabled,
      dto.automationLocale,
    ].some((value) => value !== undefined);
    if (!hasDefaultSender && !hasAutomation) {
      throw new BadRequestException('No CRM settings changes');
    }
    if (hasDefaultSender) {
      await this.authorization.require(userId, 'adSales.crm.editAny');
    }
    if (hasAutomation) {
      await this.authorization.require(userId, 'adSales.crm.manageAutomation');
    }
    const access = await this.authorization.context(userId);
    if (dto.defaultCrmSenderAccountId) {
      await this.accountAccess.requireUsableSender(
        access.workspaceId,
        dto.defaultCrmSenderAccountId,
      );
    }
    const current = await this.prisma.telegramAdCrmWorkspaceSettings.findUnique(
      {
        where: { workspaceId: access.workspaceId },
        select: settingsSelect,
      },
    );
    const data = this.changedData(current, dto);
    if (!Object.keys(data).length) {
      return current ? this.map(current) : this.defaults(access.workspaceId);
    }
    const row = current
      ? await this.prisma.telegramAdCrmWorkspaceSettings.update({
          where: { workspaceId: access.workspaceId },
          data,
          select: settingsSelect,
        })
      : await this.prisma.telegramAdCrmWorkspaceSettings.create({
          data: { workspaceId: access.workspaceId, ...data },
          select: settingsSelect,
        });
    if (dto.customerTelegramAutomationsEnabled === false) {
      await this.occurrences?.cancelWorkspace(access.workspaceId);
    } else {
      const disabledTypes = [
        ['PRE_PUBLICATION_REMINDER', dto.prePublicationReminderEnabled],
        ['PUBLISHED_LINKS', dto.publishedLinksEnabled],
        ['FOLLOW_UP', dto.followUpEnabled],
      ] as const;
      for (const [type, enabled] of disabledTypes) {
        if (enabled === false) {
          await this.occurrences?.cancelWorkspaceType(access.workspaceId, type);
        }
      }
    }
    return this.map(row);
  }

  private changedData(
    current: SettingsRow | null,
    dto: UpdateCrmWorkspaceSettingsDto,
  ): SettingsChanges {
    const data: SettingsChanges = {};
    const now = new Date();
    const assign = <K extends keyof UpdateCrmWorkspaceSettingsDto>(
      key: K,
      currentValue: UpdateCrmWorkspaceSettingsDto[K],
    ) => {
      if (dto[key] !== undefined && dto[key] !== currentValue) {
        (data as Record<string, unknown>)[key] = dto[key];
      }
    };
    assign(
      'defaultCrmSenderAccountId',
      current?.defaultCrmSenderAccountId ?? null,
    );
    if (
      dto.automationLocale !== undefined &&
      dto.automationLocale !== (current?.automationLocale ?? 'en')
    ) {
      data.automationLocale = dto.automationLocale;
    }
    const assignType = (
      enabledKey:
        | 'prePublicationReminderEnabled'
        | 'publishedLinksEnabled'
        | 'followUpEnabled',
      enabledAtKey:
        | 'prePublicationReminderEnabledAt'
        | 'publishedLinksEnabledAt'
        | 'followUpEnabledAt',
    ) => {
      const next = dto[enabledKey];
      if (next === undefined) return;
      const currentEnabled = current?.[enabledKey] ?? false;
      const missingActivation = next && !current?.[enabledAtKey];
      if (next !== currentEnabled || missingActivation) {
        data[enabledKey] = next;
        data[enabledAtKey] = next ? now : null;
      }
    };
    assignType(
      'prePublicationReminderEnabled',
      'prePublicationReminderEnabledAt',
    );
    assignType('publishedLinksEnabled', 'publishedLinksEnabledAt');
    assignType('followUpEnabled', 'followUpEnabledAt');
    const currentEnabled = current?.customerTelegramAutomationsEnabled ?? false;
    if (
      dto.customerTelegramAutomationsEnabled !== undefined &&
      dto.customerTelegramAutomationsEnabled !== currentEnabled
    ) {
      data.customerTelegramAutomationsEnabled =
        dto.customerTelegramAutomationsEnabled;
      data.customerTelegramAutomationsEnabledAt =
        dto.customerTelegramAutomationsEnabled ? now : null;
    } else if (
      dto.customerTelegramAutomationsEnabled === true &&
      !current?.customerTelegramAutomationsEnabledAt
    ) {
      data.customerTelegramAutomationsEnabled = true;
      data.customerTelegramAutomationsEnabledAt = now;
    }
    return data;
  }

  private defaults(workspaceId: string): CrmWorkspaceSettings {
    return {
      workspaceId,
      defaultCrmSenderAccountId: null,
      automation: {
        customerTelegramAutomationsEnabled: false,
        customerTelegramAutomationsEnabledAt: null,
        locale: 'en',
        typeEnabled: {
          PRE_PUBLICATION_REMINDER: false,
          PUBLISHED_LINKS: false,
          FOLLOW_UP: false,
        },
        typeSettings: {
          PRE_PUBLICATION_REMINDER: { enabled: false, enabledAt: null },
          PUBLISHED_LINKS: { enabled: false, enabledAt: null },
          FOLLOW_UP: { enabled: false, enabledAt: null },
        },
      },
      createdAt: null,
      updatedAt: null,
    };
  }

  private map(row: SettingsRow): CrmWorkspaceSettings {
    return {
      workspaceId: row.workspaceId,
      defaultCrmSenderAccountId: row.defaultCrmSenderAccountId,
      automation: {
        customerTelegramAutomationsEnabled:
          row.customerTelegramAutomationsEnabled,
        customerTelegramAutomationsEnabledAt:
          row.customerTelegramAutomationsEnabledAt?.toISOString() ?? null,
        locale: row.automationLocale as 'en' | 'ru' | 'uk',
        typeEnabled: {
          PRE_PUBLICATION_REMINDER: row.prePublicationReminderEnabled,
          PUBLISHED_LINKS: row.publishedLinksEnabled,
          FOLLOW_UP: row.followUpEnabled,
        },
        typeSettings: {
          PRE_PUBLICATION_REMINDER: {
            enabled: row.prePublicationReminderEnabled,
            enabledAt:
              row.prePublicationReminderEnabledAt?.toISOString() ?? null,
          },
          PUBLISHED_LINKS: {
            enabled: row.publishedLinksEnabled,
            enabledAt: row.publishedLinksEnabledAt?.toISOString() ?? null,
          },
          FOLLOW_UP: {
            enabled: row.followUpEnabled,
            enabledAt: row.followUpEnabledAt?.toISOString() ?? null,
          },
        },
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
