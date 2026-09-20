import { Prisma, TelegramAdSalesWorkspaceSettings } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

type AdSalesWorkspaceSettingsPrisma = Pick<
  PrismaService,
  'telegramAdSalesWorkspaceSettings'
>;

export async function findOrCreateAdSalesWorkspaceSettings(
  prisma: AdSalesWorkspaceSettingsPrisma,
  workspaceId: string,
) {
  const existing = await prisma.telegramAdSalesWorkspaceSettings.findUnique({
    where: { workspaceId },
  });
  if (existing) return existing;

  try {
    return await prisma.telegramAdSalesWorkspaceSettings.create({
      data: {
        workspaceId,
      },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      throw error;
    }
    const concurrentlyCreated =
      await prisma.telegramAdSalesWorkspaceSettings.findUnique({
        where: { workspaceId },
      });
    if (!concurrentlyCreated) throw error;
    return concurrentlyCreated;
  }
}

export function mapAdSalesWorkspaceSettings(
  settings: TelegramAdSalesWorkspaceSettings,
) {
  return {
    ...settings,
    defaultSalesCommissionRate: Number(
      settings.defaultSalesCommissionRate ?? 0,
    ),
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
  };
}
