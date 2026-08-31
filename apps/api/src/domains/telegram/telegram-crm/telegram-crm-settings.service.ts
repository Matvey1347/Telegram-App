import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrmWorkspaceSettings } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmAccountAccessService } from './telegram-crm-account-access.service';
import { UpdateCrmWorkspaceSettingsDto } from './telegram-crm.dto';

const settingsSelect = {
  workspaceId: true,
  defaultCrmSenderAccountId: true,
  customerTelegramAutomationsEnabled: true,
  customerTelegramAutomationsEnabledAt: true,
  prePublicationReminderEnabled: true,
  publishedLinksEnabled: true,
  followUpEnabled: true,
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
    | 'prePublicationReminderEnabled'
    | 'publishedLinksEnabled'
    | 'followUpEnabled'
  >
>;

@Injectable()
export class TelegramCrmSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly accountAccess: TelegramCrmAccountAccessService,
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
    return this.map(row);
  }

  private changedData(
    current: SettingsRow | null,
    dto: UpdateCrmWorkspaceSettingsDto,
  ): SettingsChanges {
    const data: SettingsChanges = {};
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
    assign(
      'prePublicationReminderEnabled',
      current?.prePublicationReminderEnabled ?? false,
    );
    assign('publishedLinksEnabled', current?.publishedLinksEnabled ?? false);
    assign('followUpEnabled', current?.followUpEnabled ?? false);
    const currentEnabled = current?.customerTelegramAutomationsEnabled ?? false;
    if (
      dto.customerTelegramAutomationsEnabled !== undefined &&
      dto.customerTelegramAutomationsEnabled !== currentEnabled
    ) {
      data.customerTelegramAutomationsEnabled =
        dto.customerTelegramAutomationsEnabled;
      data.customerTelegramAutomationsEnabledAt =
        dto.customerTelegramAutomationsEnabled ? new Date() : null;
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
        typeEnabled: {
          PRE_PUBLICATION_REMINDER: false,
          PUBLISHED_LINKS: false,
          FOLLOW_UP: false,
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
        typeEnabled: {
          PRE_PUBLICATION_REMINDER: row.prePublicationReminderEnabled,
          PUBLISHED_LINKS: row.publishedLinksEnabled,
          FOLLOW_UP: row.followUpEnabled,
        },
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
