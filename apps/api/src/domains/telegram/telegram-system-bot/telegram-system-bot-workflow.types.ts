import type {
  Prisma,
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';

export type TelegramSystemBotWorkflowScope = {
  connectionId: string;
  workspaceId: string;
};

export type CreateTelegramSystemBotWorkflowInput =
  TelegramSystemBotWorkflowScope & {
    kind: TelegramSystemBotWorkflowKind;
    step: string;
    payload: Prisma.InputJsonValue;
    controlMessageId?: number | null;
    expiresAt: Date;
  };

export type TransitionTelegramSystemBotWorkflowInput =
  TelegramSystemBotWorkflowScope & {
    id: string;
    expectedVersion: number;
    step: string;
    payload: Prisma.InputJsonValue;
    controlMessageId?: number | null;
  };

export type TelegramSystemBotWorkflowResultIds = {
  resultManagedPostId?: string | null;
  resultAdSaleId?: string | null;
  resultAdSalePlacementId?: string | null;
};

export const activeTelegramSystemBotWorkflowStatuses = [
  'ACTIVE',
  'FAILED',
] as const satisfies readonly TelegramSystemBotWorkflowStatus[];
