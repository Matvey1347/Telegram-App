import type { Prisma, TelegramSystemBotConnection } from '@prisma/client';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import type { TelegramSystemBotIncomingMessage } from './telegram-system-bot-forwarded-content.parser';
import { systemBotCommandFor } from './telegram-system-bot-menu';

export type TelegramSystemBotUpdate = {
  update_id?: number | string;
  message?: TelegramSystemBotIncomingMessage & {
    chat?: { id?: number | string; type?: string };
    from?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    text?: string;
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number | string };
    message?: {
      chat?: { id?: number | string; type?: string };
      message_id?: number;
    };
  };
  my_chat_member?: {
    chat?: {
      id?: number | string;
      type?: string;
      title?: string;
      username?: string;
    };
    old_chat_member?: {
      status?: string;
      user?: { id?: number | string };
      [key: string]: unknown;
    };
    new_chat_member?: {
      status?: string;
      user?: { id?: number | string };
      [key: string]: unknown;
    };
  };
};

export type TelegramSystemBotAction = {
  actor: NonNullable<NonNullable<TelegramSystemBotUpdate['message']>['from']>;
  chatId: string;
  telegramUserId: string;
  command: string | undefined;
  callback: string | undefined;
  callbackQueryId: string | undefined;
  callbackMessageId: number | undefined;
};

export type SystemBotAuthorizedConnection = Pick<
  TelegramSystemBotConnection,
  'id' | 'userId' | 'telegramUserId' | 'currentWorkspaceId'
>;

export const SYSTEM_BOT_AUTHORIZED_CONNECTION_SELECT = {
  id: true,
  userId: true,
  telegramUserId: true,
  currentWorkspaceId: true,
} as const satisfies Prisma.TelegramSystemBotConnectionSelect;

export const SYSTEM_BOT_WORKSPACE_MEMBERSHIP_SELECT = {
  workspaceId: true,
  role: true,
  workspace: {
    select: {
      name: true,
      timezone: true,
      avatarIcon: {
        select: {
          id: true,
          type: true,
          name: true,
          emoji: true,
          imageUrl: true,
        },
      },
    },
  },
} as const satisfies Prisma.WorkspaceMemberSelect;

export type SystemBotWorkspaceMembership = Prisma.WorkspaceMemberGetPayload<{
  select: typeof SYSTEM_BOT_WORKSPACE_MEMBERSHIP_SELECT;
}>;

export function resolveSystemBotAction(
  update: TelegramSystemBotUpdate,
): TelegramSystemBotAction | null {
  const actor = update.message?.from ?? update.callback_query?.from;
  const chatId =
    update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
  if (!actor?.id || !chatId) return null;
  const telegramUserId = String(actor.id);
  const safeChatId = String(chatId);
  const chatType =
    update.message?.chat?.type ?? update.callback_query?.message?.chat?.type;
  // Link and workspace data are private: the chat must belong to the actor.
  if (chatType !== 'private' || safeChatId !== telegramUserId) return null;
  return {
    actor,
    chatId: safeChatId,
    telegramUserId,
    command: systemBotCommandFor(update.message?.text?.trim()),
    callback: update.callback_query?.data,
    callbackQueryId: update.callback_query?.id,
    callbackMessageId: update.callback_query?.message?.message_id,
  };
}

export function presentSystemBotWorkspace(
  membership: SystemBotWorkspaceMembership,
) {
  return {
    ...membership,
    workspace: {
      ...membership.workspace,
      avatarPresentation: iconToResolvedEmoji(membership.workspace.avatarIcon),
    },
  };
}

export function systemBotWorkspaceOption(
  membership: SystemBotWorkspaceMembership,
  currentWorkspaceId: string | null,
) {
  return {
    id: membership.workspaceId,
    name: membership.workspace.name,
    role: membership.role,
    selected: membership.workspaceId === currentWorkspaceId,
    avatarPresentation: iconToResolvedEmoji(membership.workspace.avatarIcon),
  };
}

export function systemBotWorkflowScope(
  chatId: string,
  connection: SystemBotAuthorizedConnection,
  workspace: ReturnType<typeof presentSystemBotWorkspace>,
) {
  return {
    chatId,
    connectionId: connection.id,
    userId: connection.userId,
    telegramUserId: connection.telegramUserId,
    workspaceId: workspace.workspaceId,
    timezone: workspace.workspace.timezone,
  };
}
