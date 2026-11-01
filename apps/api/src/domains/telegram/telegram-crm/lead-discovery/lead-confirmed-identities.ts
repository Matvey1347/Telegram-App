import { instagramIdentity } from '../telegram-crm-instagram-identity.service';
import { normalizeLeadContact } from './lead-normalization';
import type { Prisma } from '@prisma/client';
import type { LeadContact } from '@telegram-system/shared';
/** Exact public identities shared by reviewed CRM linking and qualification DNC checks. */
export function confirmedLeadMethods(contacts: LeadContact[]) {
  return [
    ...new Map(
      contacts
        .filter(
          (contact) =>
            contact.confirmed &&
            ['ADVERTISER', 'SALES_CONTACT'].includes(contact.role) &&
            ['TELEGRAM', 'PUBLIC_BUSINESS_CONTACT', 'INSTAGRAM'].includes(
              contact.type,
            ),
        )
        .map((contact) => {
          const type =
            contact.type === 'INSTAGRAM'
              ? ('INSTAGRAM' as const)
              : contact.type === 'TELEGRAM'
                ? ('TELEGRAM_USERNAME' as const)
                : contact.value.includes('@')
                  ? ('EMAIL' as const)
                  : ('PHONE' as const);
          const value =
            type === 'INSTAGRAM'
              ? instagramIdentity(contact.value).username
              : type === 'TELEGRAM_USERNAME'
                ? contact.value.replace(/^@/, '').toLowerCase()
                : type === 'EMAIL'
                  ? contact.value.toLowerCase()
                  : contact.value.replace(/[ ()-]/g, '');
          return [`${type}:${value}`, { type, value }] as const;
        }),
    ).values(),
  ].slice(0, 12);
}
export function confirmedLeadClientWhere(
  workspaceId: string,
  contacts: LeadContact[],
): Prisma.TelegramAdvertiserWhereInput[] {
  return confirmedLeadMethods(contacts).flatMap((method) =>
    method.type === 'INSTAGRAM'
      ? [
          {
            contacts: {
              some: {
                workspaceId,
                type: 'INSTAGRAM' as const,
                normalizedValue: method.value,
              },
            },
          },
        ]
      : [
          method.type === 'TELEGRAM_USERNAME'
            ? {
                telegramUsername: {
                  equals: method.value,
                  mode: 'insensitive' as const,
                },
              }
            : method.type === 'EMAIL'
              ? {
                  email: { equals: method.value, mode: 'insensitive' as const },
                }
              : method.type === 'PHONE'
                ? { phone: method.value }
                : {
                    contacts: {
                      some: {
                        workspaceId,
                        type: 'INSTAGRAM' as const,
                        normalizedValue: method.value,
                      },
                    },
                  },
          {
            contacts: {
              some: {
                workspaceId,
                type: method.type,
                normalizedValue: method.value,
              },
            },
          },
        ],
  );
}

export function hasCurrentLeadContact(
  contact: LeadContact,
  text: string,
): boolean {
  if (!contact.evidence || !text.includes(contact.evidence)) return false;
  const candidates =
    contact.type === 'TELEGRAM'
      ? [
          ...contact.evidence.matchAll(
            /https?:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{3,31}\/?|@[A-Za-z][A-Za-z0-9_]{3,31}/gi,
          ),
        ].map((match) => match[0])
      : contact.type === 'INSTAGRAM'
        ? [
            ...contact.evidence.matchAll(
              /https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?(?:[?#][^\s<>]*)?/gi,
            ),
          ].map((match) => match[0])
        : contact.type === 'PUBLIC_BUSINESS_CONTACT'
          ? [
              ...contact.evidence.matchAll(
                /[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+\d[\d ()-]{6,20}/g,
              ),
            ].map((match) => match[0].trim())
          : [];
  for (const value of [...new Set([contact.value, ...candidates])]) {
    try {
      const normalized = normalizeLeadContact({ ...contact, value }, text);
      if (
        normalized.value === contact.value &&
        normalized.role === contact.role
      )
        return true;
    } catch {
      /* Try the original literal spelling before normalization. */
    }
  }
  return false;
}
