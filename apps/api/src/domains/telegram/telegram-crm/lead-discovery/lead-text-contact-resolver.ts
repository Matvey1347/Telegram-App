import type { LeadContact } from '@telegram-system/shared';
import { literalLeadLinks, normalizeLeadContact } from './lead-normalization';
import type { LeadTargetEvidence } from './lead-advertised-targets';

/** Literal evidence only. A destination and a sales contact are distinct roles. */
export function extractLiteralSalesContacts(text: string): LeadContact[] {
  const contacts: LeadContact[] = [];
  for (const match of text.matchAll(
    /(?:замовити|замовлення|заказать|заказ|співпрац[іяі]|сотрудничеств[оа]|реклам[а-яіїєґ]*|пишіть|пишите|контакт(?:и|ы)?)[^@\n]{0,40}(?<![A-Za-z0-9_.+-])(@[A-Za-z][A-Za-z0-9_]{3,31})(?![A-Za-z0-9_]|\.[A-Za-z])/giu,
  )) {
    try {
      const raw: LeadContact = {
        type: 'TELEGRAM',
        value: match[1],
        role: 'SALES_CONTACT',
        purpose: /реклам/iu.test(match[0])
          ? 'CONTACT_FOR_ADS'
          : 'PROJECT_CONTACT',
        evidence: match[1],
        confirmed: false,
      };
      normalizeLeadContact(raw, text);
      contacts.push(raw);
    } catch {
      /* Invalid literal remains unresolved. */
    }
    if (contacts.length >= 12) break;
  }
  for (const match of text.matchAll(
    /(?:замовити|замовлення|заказать|заказ|співпрац[іяі]|сотрудничеств[оа]|реклам[а-яіїєґ]*|пишіть|пишите|контакт(?:и|ы)?)[^\n.!?]{0,40}?(https?:\/\/[^\s<>"']+)/giu,
  )) {
    const value = match[1].replace(/[),.;!?]+$/, '');
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      // A shop or profile URL following a purchase CTA is a destination, not
      // evidence that a person or a business contact was identified.
      if (host !== 't.me') continue;
      if (
        host === 't.me' &&
        !/^\/[A-Za-z][A-Za-z0-9_]{3,31}\/?$/.test(url.pathname)
      )
        continue;
      const raw: LeadContact = {
        type: 'TELEGRAM',
        value,
        role: 'SALES_CONTACT',
        evidence: value,
        purpose: /реклам/iu.test(match[0])
          ? 'CONTACT_FOR_ADS'
          : 'PROJECT_CONTACT',
        confirmed: false,
      };
      normalizeLeadContact(raw, text);
      contacts.push(raw);
    } catch {
      /* Invalid or private references remain unresolved. */
    }
    if (contacts.length >= 12) break;
  }
  for (const match of text.matchAll(
    /(?:замовити|замовлення|заказать|заказ|співпрац[іяі]|сотрудничеств[оа]|реклам[а-яіїєґ]*|пишіть|пишите|контакт(?:и|ы)?)[^\n]{0,40}?([A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+\d[\d ()-]{6,20})/giu,
  )) {
    const raw: LeadContact = {
      type: 'PUBLIC_BUSINESS_CONTACT',
      value: match[1].trim(),
      role: 'SALES_CONTACT',
      purpose: /реклам/iu.test(match[0])
        ? 'CONTACT_FOR_ADS'
        : 'PROJECT_CONTACT',
      evidence: match[1].trim(),
      confirmed: false,
    };
    try {
      normalizeLeadContact(raw, text);
      contacts.push(raw);
    } catch {
      /* Invalid literal remains unresolved. */
    }
    if (contacts.length >= 12) break;
  }
  return contacts;
}

export function resolveTextContact(
  text: string,
  evidence: LeadTargetEvidence[],
) {
  const sites = [
    ...new Set(
      evidence
        .filter(
          (item) => item.kind === 'PUBLIC_URL' && item.origin !== 'FORWARD',
        )
        .map((item) => item.value),
    ),
  ];
  const usernames = [
    ...new Set(
      evidence
        .filter(
          (item) =>
            item.kind === 'TELEGRAM_USERNAME' &&
            ['TEXT', 'TEXT_URL', 'INLINE_BUTTON', 'ENTITY'].includes(
              item.origin,
            ) &&
            /^[a-z][a-z0-9_]{3,31}$/i.test(item.value),
        )
        .map((item) => item.value.toLowerCase()),
    ),
  ];
  if (
    sites.length === 0 &&
    usernames.length === 1 &&
    !evidence.some((item) => item.kind === 'PRIVATE_INVITE')
  ) {
    const username = usernames[0];
    const entry = evidence.find(
      (item) =>
        item.kind === 'TELEGRAM_USERNAME' &&
        item.value.toLowerCase() === username &&
        ['TEXT', 'TEXT_URL', 'INLINE_BUTTON', 'ENTITY'].includes(item.origin),
    )!;
    return {
      title: `@${username}`,
      telegramUsername: username,
      contacts: [
        {
          type: 'TELEGRAM' as const,
          role: 'ADVERTISED_DESTINATION' as const,
          value: `@${username}`,
          evidence: `@${username}`,
          evidenceSource: entry.origin as
            | 'TEXT'
            | 'TEXT_URL'
            | 'INLINE_BUTTON'
            | 'ENTITY',
          confirmed: false,
        },
        ...extractLiteralSalesContacts(text),
      ].slice(0, 12),
    };
  }
  const literalSites = literalLeadLinks(text).filter((raw) => {
    try {
      const url = new URL(raw);
      return (
        !url.search &&
        !url.hash &&
        sites.includes(`${url.protocol}//${url.host}${url.pathname}`)
      );
    } catch {
      return false;
    }
  });
  // A link to an unverified destination is not enough to select between projects.
  if (sites.length !== 1 || literalSites.length !== 1 || usernames.length)
    return null;
  const site = literalSites[0];
  const isInstagram = /^(?:www\.)?instagram\.com$/i.test(
    new URL(site).hostname,
  );
  const destination: LeadContact = {
    type: isInstagram ? 'INSTAGRAM' : 'WEBSITE',
    value: site,
    role: 'ADVERTISED_DESTINATION',
    evidence: site,
    confirmed: false,
  };
  try {
    normalizeLeadContact(destination, text);
  } catch {
    return null;
  }
  const contacts = [destination, ...extractLiteralSalesContacts(text)].slice(
    0,
    12,
  );
  return { title: site, contacts, telegramUsername: undefined };
}
