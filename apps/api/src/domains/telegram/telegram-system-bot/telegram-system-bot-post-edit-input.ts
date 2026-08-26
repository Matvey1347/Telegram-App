import type { TelegramSystemBotCapturedPostContent } from './telegram-system-bot-post-flow.types';
import type { TelegramSystemBotPostPayload } from './telegram-system-bot-post-flow.types';

type ButtonRows = TelegramSystemBotCapturedPostContent['buttonRows'];

export type TelegramSystemBotPostButtonsInputResult =
  | { ok: true; buttonRows: ButtonRows }
  | { ok: false; error: string };

export function applyTelegramSystemBotPostEdit(
  step: 'AWAIT_EDIT_TEXT' | 'AWAIT_EDIT_BUTTONS',
  payload: TelegramSystemBotPostPayload,
  value: string,
):
  | { ok: true; payload: TelegramSystemBotPostPayload }
  | { ok: false; error: string } {
  if (!payload.content)
    return { ok: false, error: 'Post content is unavailable.' };
  if (step === 'AWAIT_EDIT_BUTTONS') {
    const parsed = parseTelegramSystemBotPostButtonsInput(value);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      payload: {
        ...payload,
        content: { ...payload.content, buttonRows: parsed.buttonRows },
      },
    };
  }
  return {
    ok: true,
    payload: {
      ...payload,
      content: {
        ...payload.content,
        text: value.replace(/\r\n?/g, '\n').trim(),
      },
    },
  };
}

export function parseTelegramSystemBotPostButtonsInput(
  value: string,
): TelegramSystemBotPostButtonsInputResult {
  const trimmed = value.trim();
  if (trimmed === '-') return { ok: true, buttonRows: [] };
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return invalidButtonsInput();

  const buttonRows: ButtonRows = [];
  for (const line of lines) {
    const separator = line.indexOf('|');
    if (separator <= 0) return invalidButtonsInput();
    const text = line.slice(0, separator).trim();
    const url = line.slice(separator + 1).trim();
    if (!text || !isHttpUrl(url)) return invalidButtonsInput();
    buttonRows.push([{ text, url, style: 'default' }]);
  }
  return { ok: true, buttonRows };
}

function isHttpUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function invalidButtonsInput(): TelegramSystemBotPostButtonsInputResult {
  return {
    ok: false,
    error:
      'Send one button per line as Label | https://example.com, or - to clear buttons.',
  };
}
