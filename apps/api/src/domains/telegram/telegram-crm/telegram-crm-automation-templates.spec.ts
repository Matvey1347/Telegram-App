import {
  CRM_AUTOMATION_TEMPLATE_KEYS,
  renderCrmAutomationTemplate,
} from './telegram-crm-automation-templates';

describe('CRM customer automation templates', () => {
  it.each(['en', 'ru', 'uk'] as const)(
    'renders locale %s without orchestration copy',
    (locale) => {
      const result = renderCrmAutomationTemplate({
        automationType: 'PRE_PUBLICATION_REMINDER',
        locale,
        contactName: 'Ada',
        dealTitle: 'Launch',
        placements: [
          {
            channelTitle: 'Alpha',
            scheduledAt: new Date('2026-09-02T10:00:00.000Z'),
            timezone: 'Europe/Warsaw',
          },
        ],
      });
      expect(result?.templateKey).toBe(
        CRM_AUTOMATION_TEMPLATE_KEYS.PRE_PUBLICATION_SINGLE,
      );
      expect(result?.text).toContain('Alpha');
      expect(result?.text).toContain('Europe/Warsaw');
    },
  );

  it('selects the truthful multi-time template and lists every placement', () => {
    const result = renderCrmAutomationTemplate({
      automationType: 'PRE_PUBLICATION_REMINDER',
      locale: 'en',
      contactName: 'Ada',
      dealTitle: 'Launch',
      placements: [
        {
          channelTitle: 'Alpha',
          scheduledAt: new Date('2026-09-02T10:00:00Z'),
          timezone: 'UTC',
        },
        {
          channelTitle: 'Beta',
          scheduledAt: new Date('2026-09-02T12:00:00Z'),
          timezone: 'Europe/Kyiv',
        },
      ],
    });
    expect(result?.templateKey).toBe(
      CRM_AUTOMATION_TEMPLATE_KEYS.PRE_PUBLICATION_MULTI,
    );
    expect(result?.text).toContain('Alpha');
    expect(result?.text).toContain('Beta');
  });

  it('fails closed when a complete-publication URL is missing', () => {
    expect(
      renderCrmAutomationTemplate({
        automationType: 'PUBLISHED_LINKS',
        locale: 'en',
        contactName: 'Ada',
        dealTitle: 'Launch',
        placements: [
          { channelTitle: 'Alpha', scheduledAt: new Date(), timezone: 'UTC' },
        ],
      }),
    ).toBeNull();
  });
});
