import { Prisma, TelegramAdSalesWorkspaceSettings } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

type AdSalesWorkspaceSettingsPrisma = Pick<
  PrismaService,
  'telegramAdSalesWorkspaceSettings'
>;

const DEFAULT_ORGANIC_POSTS_PER_AD_SLOT = 3;

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
        defaultOrganicPostsPerAdSlot: DEFAULT_ORGANIC_POSTS_PER_AD_SLOT,
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
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
  };
}
