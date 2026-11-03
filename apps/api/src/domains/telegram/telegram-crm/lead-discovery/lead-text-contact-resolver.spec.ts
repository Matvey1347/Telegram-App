import {
  extractLiteralSalesContacts,
  resolveTextContact,
} from './lead-text-contact-resolver';

describe('literal text contact resolver', () => {
  it('retains a bot in a hidden button as an unverified advertised destination', () => {
    const resolved = resolveTextContact('Сучасний сервіс знайомств', [
      {
        kind: 'TELEGRAM_USERNAME',
        value: 'sample_bot',
        origin: 'INLINE_BUTTON',
        confidence: 'UNVERIFIED',
      },
    ]);
    expect(resolved).toMatchObject({
      title: '@sample_bot',
      telegramUsername: 'sample_bot',
      contacts: [
        {
          type: 'TELEGRAM',
          value: '@sample_bot',
          role: 'ADVERTISED_DESTINATION',
          evidenceSource: 'INLINE_BUTTON',
          confirmed: false,
        },
      ],
    });
  });
  it('distinguishes an advertising contact from a general project contact', () => {
    expect(extractLiteralSalesContacts('Реклама: @ad_manager')).toEqual([
      expect.objectContaining({
        value: '@ad_manager',
        purpose: 'CONTACT_FOR_ADS',
        confirmed: false,
      }),
    ]);
    expect(extractLiteralSalesContacts('Замовити @shop_manager')).toEqual([
      expect.objectContaining({
        value: '@shop_manager',
        purpose: 'PROJECT_CONTACT',
        confirmed: false,
      }),
    ]);
  });
  it('extracts a public Telegram advertising link and rejects private invites', () => {
    expect(
      extractLiteralSalesContacts('Реклама: https://t.me/ads_manager'),
    ).toEqual([
      expect.objectContaining({
        type: 'TELEGRAM',
        value: 'https://t.me/ads_manager',
        purpose: 'CONTACT_FOR_ADS',
      }),
    ]);
    expect(
      extractLiteralSalesContacts('Реклама: https://t.me/+private_invite'),
    ).toEqual([]);
  });
  it('does not turn a shop URL after an order CTA into a business contact', () => {
    expect(
      extractLiteralSalesContacts('Замовити https://shop.example/'),
    ).toEqual([]);
    expect(
      extractLiteralSalesContacts('Реклама https://instagram.com/shop'),
    ).toEqual([]);
  });
  it('separates a project site from an explicitly named sales contact', () => {
    const text =
      'Ціна 100 грн. Замовити @shop_manager. https://shop.example/item';
    const evidence = [
      {
        kind: 'PUBLIC_URL' as const,
        origin: 'TEXT' as const,
        confidence: 'UNVERIFIED' as const,
        value: 'https://shop.example/item',
      },
    ];
    expect(resolveTextContact(text, evidence)).toEqual({
      title: 'https://shop.example/item',
      contacts: [
        expect.objectContaining({
          type: 'WEBSITE',
          role: 'ADVERTISED_DESTINATION',
          confirmed: false,
        }),
        expect.objectContaining({
          type: 'TELEGRAM',
          value: '@shop_manager',
          role: 'SALES_CONTACT',
          confirmed: false,
        }),
      ],
    });
  });
  it('leaves ambiguous or nonliteral destinations unresolved', () => {
    const base = {
      kind: 'PUBLIC_URL' as const,
      origin: 'INLINE_BUTTON' as const,
      confidence: 'UNVERIFIED' as const,
    };
    expect(
      resolveTextContact('Замовити @shop_manager', [
        { ...base, value: 'https://shop.example/' },
      ]),
    ).toBeNull();
    expect(
      resolveTextContact('https://one.example/ https://two.example/', [
        { ...base, value: 'https://one.example/' },
        { ...base, value: 'https://two.example/' },
      ]),
    ).toBeNull();
  });
  it('extracts explicit business email without mistaking its domain for a Telegram username', () => {
    expect(extractLiteralSalesContacts('Контакт sales@store.example')).toEqual([
      expect.objectContaining({
        type: 'PUBLIC_BUSINESS_CONTACT',
        value: 'sales@store.example',
        role: 'SALES_CONTACT',
        confirmed: false,
      }),
    ]);
  });
});
