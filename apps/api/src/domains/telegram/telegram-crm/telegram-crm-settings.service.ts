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
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TelegramAdCrmWorkspaceSettingsSelect;

type SettingsRow = Prisma.TelegramAdCrmWorkspaceSettingsGetPayload<{
  select: typeof settingsSelect;
}>;

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
    if (dto.defaultCrmSenderAccountId === undefined) {
      throw new BadRequestException('No CRM settings changes');
    }
    const access = await this.authorization.require(
      userId,
      'adSales.crm.editAny',
    );
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
    if (current?.defaultCrmSenderAccountId === dto.defaultCrmSenderAccountId) {
      return this.map(current);
    }
    const row = current
      ? await this.prisma.telegramAdCrmWorkspaceSettings.update({
          where: { workspaceId: access.workspaceId },
          data: { defaultCrmSenderAccountId: dto.defaultCrmSenderAccountId },
          select: settingsSelect,
        })
      : await this.prisma.telegramAdCrmWorkspaceSettings.create({
          data: {
            workspaceId: access.workspaceId,
            defaultCrmSenderAccountId: dto.defaultCrmSenderAccountId,
          },
          select: settingsSelect,
        });
    return this.map(row);
  }

  private defaults(workspaceId: string): CrmWorkspaceSettings {
    return {
      workspaceId,
      defaultCrmSenderAccountId: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  private map(row: SettingsRow): CrmWorkspaceSettings {
    return {
      workspaceId: row.workspaceId,
      defaultCrmSenderAccountId: row.defaultCrmSenderAccountId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
