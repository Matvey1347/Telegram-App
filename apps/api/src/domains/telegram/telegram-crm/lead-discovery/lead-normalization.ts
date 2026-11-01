import { instagramIdentity } from '../telegram-crm-instagram-identity.service';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  isTelegramUsername,
  normalizeTelegramUsername,
  parseTelegramInviteReference,
} from '../../../../telegram/shared/imports/telegram-import.helpers';
import type { LeadContact, LeadSourceInput } from '@telegram-system/shared';
export const leadHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const leadLimit = (value?: number) =>
  Math.max(1, Math.min(50, Number.isInteger(value) ? value! : 25));
export function normalizeLeadSource(
  input: Pick<LeadSourceInput, 'type' | 'reference'>,
) {
  const reference = input.reference.trim();
  if (input.type === 'MANUAL_IMPORT') {
    if (!/^[\p{L}\p{N} _.-]{1,100}$/u.test(reference))
      throw new BadRequestException('LEAD_MANUAL_SOURCE_INVALID');
    return {
      normalizedKey: `manual:${reference.toLowerCase()}`,
      channelId: null,
      username: null,
      url: null,
    };
  }
  if (input.type !== 'TELEGRAM_CHANNEL')
    throw new BadRequestException('LEAD_SOURCE_TYPE_UNSUPPORTED');
  const invite = parseTelegramInviteReference(reference);
  if (invite)
    return {
      normalizedKey: `telegram:invite:${leadHash(invite.inviteHash)}`,
      username: null,
      channelId: null,
      url: invite.inviteLink,
    };
  const username = reference
    .replace(/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i, '')
    .replace(/\/$/, '')
    .replace(/^@/, '');
  if (isTelegramUsername(username)) {
    const normalized = normalizeTelegramUsername(username)!;
    return {
      normalizedKey: `telegram:username:${normalized}`,
      username: normalized,
      channelId: null,
      url: `https://t.me/${normalized}`,
    };
  }
  if (/^(?:-100)?[1-9]\d{0,18}$/.test(reference)) {
    const channelId = reference.replace(/^-100/, '');
    return {
      normalizedKey: `telegram:id:${channelId}`,
      channelId,
      username: null,
      url: null,
    };
  }
  throw new BadRequestException('LEAD_CHANNEL_REFERENCE_INVALID');
}
export function literalLeadLinks(text: string): string[] {
  const links = [...text.matchAll(/https?:\/\/[^\s<>"']+/giu)].map((match) =>
    match[0].replace(/[),.;!?]+$/, ''),
  );
  return [
    ...new Set(
      links.filter((value) => {
        try {
          const url = new URL(value);
          return (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            value.length <= 500
          );
        } catch {
          return false;
        }
      }),
    ),
  ].slice(0, 30);
}
export function normalizeLeadContact(
  contact: LeadContact,
  text: string,
): LeadContact {
  if (
    !['TELEGRAM', 'INSTAGRAM', 'WEBSITE', 'PUBLIC_BUSINESS_CONTACT'].includes(
      contact.type,
    ) ||
    ![
      'ADVERTISED_DESTINATION',
      'ADVERTISER',
      'SALES_CONTACT',
      'AGENCY',
      'UNKNOWN',
    ].includes(contact.role) ||
    !contact.value ||
    contact.value.length > 500 ||
    !contact.evidence ||
    contact.evidence.length > 1000 ||
    !text.includes(contact.evidence) ||
    !contact.evidence.includes(contact.value)
  )
    throw new BadRequestException('LEAD_CONTACT_NOT_LITERAL');
  let value = contact.value.trim();
  let role = contact.role;
  if (contact.type === 'TELEGRAM') {
    if (!/^@/.test(value) && !/^https?:\/\/t\.me\//i.test(value))
      throw new BadRequestException('LEAD_TELEGRAM_CONTACT_INVALID');
    const raw = value
      .replace(/^https?:\/\/t\.me\//i, '')
      .replace(/^@/, '')
      .replace(/\/$/, '');
    if (raw.startsWith('@') || !isTelegramUsername(raw))
      throw new BadRequestException('LEAD_TELEGRAM_CONTACT_INVALID');
    if (
      /^https?:/i.test(contact.value)
        ? !literalLeadLinks(text).includes(contact.value)
        : !new RegExp(`(^|[^A-Za-z0-9_])@${raw}(?![A-Za-z0-9_])`).test(text)
    )
      throw new BadRequestException('LEAD_CONTACT_NOT_LITERAL');
    value = `@${normalizeTelegramUsername(raw)}`;
    if (['ADVERTISER', 'SALES_CONTACT'].includes(role)) {
      const position = text.indexOf(contact.value),
        before = text.slice(Math.max(0, position - 100), position);
      if (
        !/(?:пишіть|пишiть|напишіть|пишите|контакт(?:и|ы)?|замовлення|заказ|sales contact|contact us|write to|message us)[^@\n]{0,60}$/iu.test(
          before,
        )
      )
        role = 'ADVERTISED_DESTINATION';
    }
  } else if (contact.type === 'WEBSITE' || contact.type === 'INSTAGRAM') {
    if (!literalLeadLinks(text).includes(contact.value))
      throw new BadRequestException('LEAD_CONTACT_NOT_LITERAL');
    const url = new URL(value);
    if (contact.type === 'INSTAGRAM') {
      let profile: ReturnType<typeof instagramIdentity>;
      try {
        profile = instagramIdentity(value);
      } catch {
        throw new BadRequestException('LEAD_INSTAGRAM_PROFILE_INVALID');
      }
      const position = text.indexOf(contact.value),
        before = text.slice(Math.max(0, position - 100), position);
      if (
        ['ADVERTISER', 'SALES_CONTACT'].includes(role) &&
        !/(?:пишіть|напишіть|пишите|контакт(?:и|ы)?|замовлення|заказ|sales contact|contact us|write to|message us)[^\n]{0,60}$/iu.test(
          before,
        )
      )
        role = 'ADVERTISED_DESTINATION';
      value = profile.profileUrl.replace(/\/$/, '');
    } else value = url.toString().replace(/\/$/, '');
  } else if (
    !/^(?:[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+\d[\d ()-]{6,20})$/.test(
      value,
    )
  )
    throw new BadRequestException('LEAD_PUBLIC_CONTACT_INVALID');
  if (contact.type === 'PUBLIC_BUSINESS_CONTACT') {
    if (
      value.includes('@') &&
      ![
        ...text.matchAll(/[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g),
      ].some((match) => match[0] === value)
    )
      throw new BadRequestException('LEAD_CONTACT_NOT_LITERAL');
    if (value.startsWith('+')) {
      const end = text.indexOf(value) + value.length;
      if (/^[\d ()-]*\d/.test(text.slice(end)))
        throw new BadRequestException('LEAD_CONTACT_NOT_LITERAL');
    }
  }
  if (contact.type === 'PUBLIC_BUSINESS_CONTACT')
    value = value.includes('@')
      ? value.toLowerCase()
      : value.replace(/[ ()-]/g, '');
  return { ...contact, role, value, evidence: contact.value, confirmed: false };
}
export function strongLeadIdentity(contacts: LeadContact[]) {
  const strong = contacts.find(
    (contact) =>
      ['ADVERTISER', 'SALES_CONTACT'].includes(contact.role) &&
      ['TELEGRAM', 'PUBLIC_BUSINESS_CONTACT', 'INSTAGRAM'].includes(
        contact.type,
      ) &&
      (contact.type !== 'INSTAGRAM' || contact.confirmed),
  );
  return strong
    ? `${strong.type.toLowerCase()}:${strong.value.toLowerCase().replace(/\s+/g, '')}`
    : null;
}
export function leadCursor(id: string) {
  return Buffer.from(id).toString('base64url');
}
export function decodeLeadCursor(cursor?: string) {
  if (!cursor) return undefined;
  const id = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || leadCursor(id) !== cursor)
    throw new BadRequestException('LEAD_CURSOR_INVALID');
  return id;
}
export function leadFeedCursor(row: { id: string; observedAt: Date }) {
  return Buffer.from(
    JSON.stringify({ v: 1, id: row.id, at: row.observedAt.toISOString() }),
  ).toString('base64url');
}
export function decodeLeadFeedCursor(cursor?: string) {
  if (!cursor) return undefined;
  try {
    if (cursor.length > 250) throw new Error();
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { v?: unknown; id?: unknown; at?: unknown };
    if (
      value.v !== 1 ||
      typeof value.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(value.id) ||
      typeof value.at !== 'string'
    )
      throw new Error();
    const observedAt = new Date(value.at);
    if (
      observedAt.toISOString() !== value.at ||
      leadFeedCursor({ id: value.id, observedAt }) !== cursor
    )
      throw new Error();
    return { id: value.id, observedAt };
  } catch {
    throw new BadRequestException('LEAD_CURSOR_INVALID');
  }
}
