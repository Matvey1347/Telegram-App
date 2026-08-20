import { BadRequestException } from '@nestjs/common';
import type { GreeterSequenceStepInput } from '@telegram-system/shared';
import type { GreeterButtonRows } from './greeter-automation.service';
import { assertValidGreeterTemplate } from './greeter-template.renderer';

export function validateGreeterButtons(buttons?: GreeterButtonRows) {
  if (buttons !== undefined && !Array.isArray(buttons))
    throw new BadRequestException('Buttons must be arranged in rows');
  if ((buttons?.length ?? 0) > 8)
    throw new BadRequestException('Buttons support at most 8 rows');
  for (const row of buttons ?? []) {
    if (!Array.isArray(row) || row.length === 0 || row.length > 8)
      throw new BadRequestException('Each button row must contain 1-8 buttons');
    for (const button of row) {
      if (
        !button ||
        typeof button.text !== 'string' ||
        !button.text.trim() ||
        (typeof button.url !== 'string' &&
          typeof button.callbackData !== 'string')
      )
        throw new BadRequestException('Buttons require text and an action');
      if (!button.url) continue;
      try {
        const url = new URL(button.url);
        if (!['https:', 'http:', 'tg:'].includes(url.protocol))
          throw new Error();
      } catch {
        throw new BadRequestException('Button URL must use http(s) or tg');
      }
    }
  }
}

export function validateGreeterSteps(steps: GreeterSequenceStepInput[]) {
  if (!steps.length)
    throw new BadRequestException('A sequence needs at least one step');
  for (const [index, step] of steps.entries()) {
    if (
      !Number.isInteger(step.delaySeconds) ||
      step.delaySeconds < 0 ||
      step.delaySeconds > 365 * 86400
    )
      throw new BadRequestException(`Invalid delay at step ${index + 1}`);
    if (!step.messageText.trim())
      throw new BadRequestException(`Message is required at step ${index + 1}`);
    try {
      assertValidGreeterTemplate(step.messageText);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    validateGreeterButtons(step.buttons);
  }
}

export function mapGreeterStep(step: {
  id: string;
  position: number;
  delaySeconds: number;
  enabled: boolean;
  messageText: string;
  buttons: unknown;
}) {
  return {
    id: step.id,
    position: step.position,
    delaySeconds: step.delaySeconds,
    enabled: step.enabled,
    messageText: step.messageText,
    buttons: (step.buttons ?? []) as GreeterButtonRows,
  };
}

export function mapGreeterTester(user: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  telegramUserId: string;
}) {
  return {
    id: user.id,
    displayName:
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username ||
      user.telegramUserId,
    username: user.username,
    telegramUserId: user.telegramUserId,
  };
}

export function mapGreeterTestSession(session: {
  enabled: boolean;
  generation: number;
  startedAt: Date | null;
  lastInteractionAt: Date | null;
  enabledAt: Date | null;
  disabledAt: Date | null;
  telegramUser: Parameters<typeof mapGreeterTester>[0] | null;
  channel: { id: string; title: string; username: string | null } | null;
}) {
  return {
    enabled: session.enabled,
    tester: session.telegramUser
      ? mapGreeterTester(session.telegramUser)
      : null,
    channel: session.channel,
    runNumber: session.generation,
    generation: session.generation,
    startedAt: session.startedAt?.toISOString() ?? null,
    lastInteractionAt: session.lastInteractionAt?.toISOString() ?? null,
    enabledAt: session.enabledAt?.toISOString() ?? null,
    disabledAt: session.disabledAt?.toISOString() ?? null,
  };
}
