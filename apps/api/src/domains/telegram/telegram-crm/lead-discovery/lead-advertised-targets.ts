import { leadHash, literalLeadLinks } from './lead-normalization';
import type { TelegramLeadPostMetadata } from '../../../../telegram/shared/mtproto/telegram-lead-channel.types';

import type { LeadTargetEvidence } from '@telegram-system/shared';
export type { LeadTargetEvidence } from '@telegram-system/shared';

/** Local extraction only; URLs are reduced to identity and never fetched. */
export function extractLeadTargetEvidence(
  text: string,
  metadata?: TelegramLeadPostMetadata,
): LeadTargetEvidence[] {
  const output: LeadTargetEvidence[] = [];
  const add = (
    kind: LeadTargetEvidence['kind'],
    value: string,
    origin: LeadTargetEvidence['origin'],
    confidence: LeadTargetEvidence['confidence'] = 'UNVERIFIED',
  ) => {
    if (
      output.length < 60 &&
      !output.some(
        (item) =>
          item.kind === kind && item.value === value && item.origin === origin,
      )
    )
      output.push({ kind, value, origin, confidence });
  };
  const url = (raw: string, origin: LeadTargetEvidence['origin']) => {
    try {
      const parsed = new URL(raw);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      )
        return;
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.split('/').filter(Boolean);
      if (
        ['t.me', 'telegram.me', 'www.t.me', 'www.telegram.me'].includes(host)
      ) {
        const name = path[0] ?? '';
        if (name.startsWith('+') || name.toLowerCase() === 'joinchat') {
          const secret = name.startsWith('+') ? name.slice(1) : path[1];
          if (secret && /^[A-Za-z0-9_-]{5,200}$/.test(secret))
            add('PRIVATE_INVITE', leadHash(secret), origin);
        } else if (
          /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(name) &&
          !['share', 's', 'c', 'addstickers', 'proxy'].includes(
            name.toLowerCase(),
          )
        ) {
          add('TELEGRAM_USERNAME', name.toLowerCase(), origin);
        }
      } else
        add(
          'PUBLIC_URL',
          `${parsed.protocol}//${host}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`.slice(
            0,
            500,
          ),
          origin,
        );
    } catch {
      /* Invalid or unsupported URL. */
    }
  };
  for (const value of literalLeadLinks(text)) url(value, 'TEXT');
  for (const value of metadata?.entityUrls ?? [])
    if (!metadata?.textUrls?.includes(value)) url(value, 'ENTITY');
  for (const value of metadata?.textUrls ?? []) url(value, 'TEXT_URL');
  for (const value of metadata?.inlineButtonUrls ?? [])
    url(value, 'INLINE_BUTTON');
  for (const mention of metadata?.mentions ?? []) {
    if (/^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(mention))
      add('TELEGRAM_USERNAME', mention.slice(1).toLowerCase(), 'MENTION');
  }
  for (const match of text.matchAll(
    /(?:^|[^\p{L}\p{N}_@])@([A-Za-z][A-Za-z0-9_]{3,31})(?![A-Za-z0-9_])/gu,
  ))
    add('TELEGRAM_USERNAME', match[1].toLowerCase(), 'MENTION');
  if (
    metadata?.forwardChannelId &&
    /^\d{1,20}$/.test(metadata.forwardChannelId)
  )
    add(
      'TELEGRAM_CHANNEL_ID',
      metadata.forwardChannelId,
      'FORWARD',
      'CANONICAL',
    );
  return output;
}

/** Resolve only identities already validated as allowed sources in this workspace. */
export function resolveLeadTargets(
  evidence: LeadTargetEvidence[],
  source: { channelId: string | null; username: string | null },
  allowed: Array<{ channelId: string | null; username: string | null }>,
) {
  const own = source.username?.toLowerCase();
  const identities = new Map(
    allowed.flatMap((item) =>
      item.username && item.channelId && /^\d{1,20}$/.test(item.channelId)
        ? [[item.username.toLowerCase(), item.channelId] as const]
        : [],
    ),
  );
  return evidence.flatMap((item) => {
    if (item.kind === 'TELEGRAM_USERNAME' && item.value === own) return [];
    if (item.kind === 'TELEGRAM_CHANNEL_ID' && item.value === source.channelId)
      return [];
    if (item.kind === 'TELEGRAM_USERNAME') {
      const canonical = identities.get(item.value);
      return canonical && canonical !== source.channelId
        ? [
            item,
            {
              ...item,
              kind: 'TELEGRAM_CHANNEL_ID' as const,
              value: canonical,
              confidence: 'CANONICAL' as const,
            },
          ]
        : [item];
    }
    return [item];
  });
}
