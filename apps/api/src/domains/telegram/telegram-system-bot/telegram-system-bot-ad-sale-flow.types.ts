import type { Prisma } from '@prisma/client';
import type { ResolvedEmoji } from '@telegram-system/shared';
import type { TelegramAdSalesBotDeliveryAction } from '../telegram-ad-sales/telegram-ad-sales-bot-command.types';
import type {
  TelegramAdSalesBotTarget,
  TelegramAdSalesStandardFormatName,
} from '../telegram-ad-sales/telegram-ad-sales-bot-targets.service';
import type { TelegramSystemBotCapturedPostContent } from './telegram-system-bot-post-flow.types';
import type { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';

export type TelegramSystemBotAdSaleScope = {
  connectionId: string;
  workspaceId: string;
  userId: string;
  telegramUserId: string;
  chatId: string;
  timezone: string;
};

export type TelegramSystemBotAdSaleTarget =
  | { kind: 'CHANNELS'; channelIds: string[]; labels: string[] }
  | { kind: 'NETWORK'; networkId: string; label: string };

export type TelegramSystemBotAdSalePayload = {
  mode?: 'NEW' | 'EXISTING';
  existingPlacementId?: string;
  existingSaleLabel?: string;
  existingChannelLabel?: string;
  existingFormatLabel?: string;
  existingScheduleLabel?: string;
  finance?: {
    accountId: string;
    accountLabel: string;
    currency: string;
    amount?: number;
  };
  financeSkipped?: boolean;
  assignedMemberId?: string;
  memberLabel?: string;
  target?: TelegramSystemBotAdSaleTarget;
  skipPost?: boolean;
  content?: TelegramSystemBotCapturedPostContent;
  existingManagedPostId?: string;
  existingManagedPostLabel?: string;
  formatName?: TelegramAdSalesStandardFormatName;
  deliveryAction?: TelegramAdSalesBotDeliveryAction;
  scheduledAt?: string;
};

export type TelegramSystemBotAdSaleOptions = {
  currentMember?: { id: string; name: string };
  accounts?: Array<{
    id: string;
    name: string;
    currency: string;
    assignedMemberName?: string | null;
    iconPresentation?: ResolvedEmoji | null;
  }>;
  members?: Array<{ id: string; name: string }>;
  channels?: Array<{ id: string; title: string }>;
  networks?: Array<{
    id: string;
    name: string;
    channelCount: number;
    selectable: boolean;
  }>;
  formats?: Array<{ name: TelegramAdSalesStandardFormatName }>;
  placements?: Array<{
    placementId: string;
    label: string;
    saleLabel: string;
    channelTitle: string;
    productLabel: string;
    scheduledLabel: string;
  }>;
  managedPosts?: Array<{ id: string; title: string; status: string }>;
};

export type TelegramSystemBotAdSaleWorkflow = Awaited<
  ReturnType<TelegramSystemBotWorkflowStore['get']>
>;

export function adSalePayload(
  value: Prisma.JsonValue,
): TelegramSystemBotAdSalePayload {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

export function adSalePayloadJson(
  value: TelegramSystemBotAdSalePayload,
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function adSaleCommandTarget(
  target: TelegramSystemBotAdSaleTarget,
): TelegramAdSalesBotTarget {
  return target.kind === 'NETWORK'
    ? { kind: 'NETWORK', networkId: target.networkId }
    : { kind: 'CHANNELS', channelIds: target.channelIds };
}
