import { ConflictException } from '@nestjs/common';
import { zonedDateTimeToUtc } from '../telegram-ad-sales/domain/timezone';
import {
  telegramSystemBotPostJson,
  telegramSystemBotPostPayload,
  type TelegramSystemBotCapturedPostContent,
  type TelegramSystemBotPostFlowScope,
  type TelegramSystemBotPostWorkflow,
} from './telegram-system-bot-post-flow.types';
import type { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';

const WORKFLOW_TTL_MS = 30 * 60_000;

export function telegramSystemBotPostWorkflowExpiry() {
  return new Date(Date.now() + WORKFLOW_TTL_MS);
}

export function parseTelegramSystemBotPostSchedule(
  value: string,
  timezone: string,
) {
  const trimmed = value.trim();
  const local = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/.exec(trimmed);
  if (local) {
    const [, day, month, year, hour, minute] = local;
    return zonedDateTimeToUtc(
      `${year}-${month}-${day}`,
      `${hour}:${minute}`,
      timezone,
    );
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function telegramSystemBotPostTitle(
  content: TelegramSystemBotCapturedPostContent,
) {
  return (
    content.text
      .split('\n')
      .find((line) => line.trim())
      ?.trim()
      .slice(0, 120) ||
    (content.sourceTitle
      ? `Forwarded from ${content.sourceTitle}`
      : 'Forwarded post')
  );
}

export function mergeTelegramSystemBotAlbumContent(
  current: TelegramSystemBotCapturedPostContent,
  incoming: TelegramSystemBotCapturedPostContent,
): TelegramSystemBotCapturedPostContent {
  return {
    ...current,
    text: current.text || incoming.text,
    imageUrls: [...new Set([...current.imageUrls, ...incoming.imageUrls])],
    buttonRows: current.buttonRows.length
      ? current.buttonRows
      : incoming.buttonRows,
    warnings: [...new Set([...current.warnings, ...incoming.warnings])],
  };
}

export async function transitionTelegramSystemBotCapturedContent(input: {
  workflows: TelegramSystemBotWorkflowStore;
  scope: TelegramSystemBotPostFlowScope;
  active: TelegramSystemBotPostWorkflow;
  incoming: TelegramSystemBotCapturedPostContent;
  sameAlbum: boolean;
}) {
  const { workflows, scope, active, incoming, sameAlbum } = input;
  const payload = telegramSystemBotPostPayload(active.payload);
  const content = sameAlbum
    ? mergeTelegramSystemBotAlbumContent(payload.content!, incoming)
    : incoming;
  try {
    return await workflows.transition({
      ...scope,
      id: active.id,
      expectedVersion: active.version,
      step: sameAlbum
        ? active.step
        : payload.destination === 'AD_SALE_MODAL'
          ? 'CHOOSE_ACTION'
          : 'CHOOSE_CHANNEL',
      payload: telegramSystemBotPostJson({ ...payload, content }),
    });
  } catch (error) {
    if (!sameAlbum || !(error instanceof ConflictException)) throw error;
    const latest = await workflows.get(scope, active.id);
    const latestPayload = telegramSystemBotPostPayload(latest.payload);
    if (latestPayload.content?.mediaGroupId !== incoming.mediaGroupId)
      throw error;
    return workflows.transition({
      ...scope,
      id: latest.id,
      expectedVersion: latest.version,
      step: latest.step,
      payload: telegramSystemBotPostJson({
        ...latestPayload,
        content: mergeTelegramSystemBotAlbumContent(
          latestPayload.content,
          incoming,
        ),
      }),
    });
  }
}
