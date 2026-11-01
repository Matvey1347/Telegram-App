import {
  confirmedLeadMethods,
  hasCurrentLeadContact,
  confirmedLeadClientWhere,
} from './lead-confirmed-identities';
import { normalizeLeadContact, strongLeadIdentity } from './lead-normalization';
import type { LeadContact } from '@telegram-system/shared';
const literal = 'https://instagram.com/Business.Profile';
const text = `Sales contact ${literal}`;
const contact: LeadContact = {
  type: 'INSTAGRAM',
  role: 'SALES_CONTACT',
  value: 'https://www.instagram.com/business.profile',
  evidence: literal,
  confirmed: true,
};
describe('public Instagram lead identity', () => {
  it('requires current literal business-role evidence and human confirmation', () => {
    expect(
      normalizeLeadContact({ ...contact, value: literal }, text),
    ).toMatchObject({
      value: contact.value,
      role: 'SALES_CONTACT',
      confirmed: false,
    });
    expect(hasCurrentLeadContact(contact, text)).toBe(true);
    expect(
      hasCurrentLeadContact(
        contact,
        'Sales contact https://instagram.com/another.profile',
      ),
    ).toBe(false);
    expect(confirmedLeadMethods([{ ...contact, confirmed: false }])).toEqual(
      [],
    );
    expect(confirmedLeadMethods([contact])).toEqual([
      { type: 'INSTAGRAM', value: 'business.profile' },
    ]);
    expect(strongLeadIdentity([contact])).toContain('instagram:');
    expect(strongLeadIdentity([{ ...contact, confirmed: false }])).toBeNull();
  });
  it('does not make advertised destinations or agencies an owner or match by name', () => {
    expect(
      normalizeLeadContact({ ...contact, value: literal }, `Visit ${literal}`)
        .role,
    ).toBe('ADVERTISED_DESTINATION');
    expect(confirmedLeadMethods([{ ...contact, role: 'AGENCY' }])).toEqual([]);
    expect(
      JSON.stringify(confirmedLeadClientWhere('workspace', [contact])),
    ).not.toMatch(/displayName|telegramUsername|phone/);
    expect(confirmedLeadClientWhere('workspace', [contact])).toEqual([
      {
        contacts: {
          some: {
            workspaceId: 'workspace',
            type: 'INSTAGRAM',
            normalizedValue: 'business.profile',
          },
        },
      },
    ]);
  });
});
