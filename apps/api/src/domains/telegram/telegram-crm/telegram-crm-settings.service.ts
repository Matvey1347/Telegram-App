import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import type { CrmWorkspaceSettings } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmAccountAccessService } from './telegram-crm-account-access.service';
import { UpdateCrmWorkspaceSettingsDto } from './telegram-crm.dto';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';

const settingsSelect = {
  workspaceId: true,
  defaultCrmSenderAccountId: true,
  importTagIds: true,
  purchaseTagId: true,
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
    @Optional() private readonly runtime?: TelegramCrmRuntimeManager,
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
    if (
      dto.defaultCrmSenderAccountId === undefined &&
      dto.importTagIds === undefined &&
      dto.purchaseTagId === undefined
    ) {
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
    const importTagIds = dto.importTagIds
      ? [...new Set(dto.importTagIds)]
      : undefined;
    if (importTagIds?.length) {
      const tags = await this.prisma.telegramAdvertiserTag.findMany({
        where: {
          id: { in: importTagIds },
          workspaceId: access.workspaceId,
          systemKey: { startsWith: 'TELEGRAM_FOLDER:' },
        },
        select: { id: true },
      });
      if (tags.length !== importTagIds.length) {
        throw new BadRequestException(
          'Import tags must be Telegram folder tags',
        );
      }
    }
    const effectiveImportTagIds =
      importTagIds ??
      currentImportTags(
        await this.prisma.telegramAdCrmWorkspaceSettings.findUnique({
          where: { workspaceId: access.workspaceId },
          select: { importTagIds: true },
        }),
      );
    if (dto.purchaseTagId) {
      if (!effectiveImportTagIds.includes(dto.purchaseTagId)) {
        throw new BadRequestException(
          'Purchase tag must be one of the import tags',
        );
      }
      const tag = await this.prisma.telegramAdvertiserTag.findFirst({
        where: {
          id: dto.purchaseTagId,
          workspaceId: access.workspaceId,
          systemKey: { startsWith: 'TELEGRAM_FOLDER:' },
        },
        select: { id: true },
      });
      if (!tag) throw new BadRequestException('Purchase tag is invalid');
    }
    const current = await this.prisma.telegramAdCrmWorkspaceSettings.findUnique(
      {
        where: { workspaceId: access.workspaceId },
        select: settingsSelect,
      },
    );
    if (
      current &&
      (dto.defaultCrmSenderAccountId === undefined ||
        current.defaultCrmSenderAccountId === dto.defaultCrmSenderAccountId) &&
      (dto.importTagIds === undefined ||
        arraysEqual(current.importTagIds, importTagIds!)) &&
      (dto.purchaseTagId === undefined ||
        current.purchaseTagId === dto.purchaseTagId)
    ) {
      return this.map(current);
    }
    const row = current
      ? await this.prisma.telegramAdCrmWorkspaceSettings.update({
          where: { workspaceId: access.workspaceId },
          data: {
            ...(dto.defaultCrmSenderAccountId === undefined
              ? {}
              : { defaultCrmSenderAccountId: dto.defaultCrmSenderAccountId }),
            ...(importTagIds === undefined ? {} : { importTagIds }),
            ...(dto.purchaseTagId === undefined
              ? {}
              : { purchaseTagId: dto.purchaseTagId }),
          },
          select: settingsSelect,
        })
      : await this.prisma.telegramAdCrmWorkspaceSettings.create({
          data: {
            workspaceId: access.workspaceId,
            defaultCrmSenderAccountId: dto.defaultCrmSenderAccountId ?? null,
            importTagIds: importTagIds ?? [],
            purchaseTagId: dto.purchaseTagId ?? null,
          },
          select: settingsSelect,
        });
    if (dto.purchaseTagId)
      await this.applyPurchaseTag(access.workspaceId, dto.purchaseTagId);
    return this.map(row);
  }

  private defaults(workspaceId: string): CrmWorkspaceSettings {
    return {
      workspaceId,
      defaultCrmSenderAccountId: null,
      importTagIds: [],
      purchaseTagId: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  private map(row: SettingsRow): CrmWorkspaceSettings {
    return {
      workspaceId: row.workspaceId,
      defaultCrmSenderAccountId: row.defaultCrmSenderAccountId,
      importTagIds: row.importTagIds,
      purchaseTagId: row.purchaseTagId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async applyPurchaseTag(workspaceId: string, tagId: string) {
    const placements = await this.prisma.telegramAdSalePlacement.findMany({
      where: {
        workspaceId,
        status: {
          notIn: [
            TelegramAdPlacementStatus.CANCELLED,
            TelegramAdPlacementStatus.MISSED,
          ],
        },
        sale: {
          advertiserId: { not: null },
          status: {
            in: [
              TelegramAdSaleStatus.RESERVED,
              TelegramAdSaleStatus.CONFIRMED,
              TelegramAdSaleStatus.IN_PROGRESS,
              TelegramAdSaleStatus.COMPLETED,
            ],
          },
        },
      },
      select: { sale: { select: { advertiserId: true } } },
    });
    const advertiserIds = [
      ...new Set(
        placements.flatMap((item) =>
          item.sale.advertiserId ? [item.sale.advertiserId] : [],
        ),
      ),
    ];
    if (!advertiserIds.length) return;
    await this.prisma.telegramAdvertiserTagAssignment.createMany({
      data: advertiserIds.map((advertiserId) => ({
        workspaceId,
        advertiserId,
        tagId,
      })),
      skipDuplicates: true,
    });
    const tag = await this.prisma.telegramAdvertiserTag.findUnique({
      where: { id: tagId },
      select: { systemKey: true },
    });
    const match = tag?.systemKey?.match(/^TELEGRAM_FOLDER:([^:]+):(\d+)$/);
    if (!match || !this.runtime) return;
    const [, accountId, folderId] = match;
    const conversations = await this.prisma.telegramCrmConversation.findMany({
      where: {
        workspaceId,
        contactId: { in: advertiserIds },
        mtprotoAccountId: accountId,
        telegramAccessHash: { not: null },
      },
      select: {
        telegramAccessHash: true,
        peer: { select: { telegramUserId: true } },
      },
    });
    for (const conversation of conversations) {
      await this.runtime.withAccountHandle(
        workspaceId,
        accountId,
        'sync',
        (handle) =>
          handle.setDialogFolderMembership({
            folderId: Number(folderId),
            telegramUserId: conversation.peer.telegramUserId,
            telegramAccessHash: conversation.telegramAccessHash!,
            included: true,
          }),
      );
    }
  }
}

const currentImportTags = (row: { importTagIds: string[] } | null) =>
  row?.importTagIds ?? [];
const arraysEqual = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);
