import {
  buildAdCampaignListWhere,
  buildAdCampaignPageIdQuery,
} from './ad-campaign-list-query';

describe('ad campaign server list query', () => {
  it.each(['date_desc', 'date_asc', 'cost_desc', 'joined_desc'] as const)(
    'builds a bounded globally ordered page for %s',
    (sort) => {
      const query = buildAdCampaignPageIdQuery(
        'workspace-1',
        {
          search: 'source title',
          dateFrom: '2026-08-01',
          dateTo: '2026-08-31',
          sort,
        },
        50,
        50,
      );
      const sql = query.strings.join('?');

      expect(sql).toContain(
        'COALESCE(campaign."placementDate", campaign."startedAt", campaign."createdAt")',
      );
      expect(sql).toContain('"AdCampaignTelegramChannelPlacement"');
      expect(sql).toContain('"AdHypothesisCampaign"');
      expect(sql).toContain('OFFSET');
      expect(sql).toContain('LIMIT');
      expect(query.values).toEqual(
        expect.arrayContaining(['workspace-1', '%source title%', 50]),
      );
    },
  );

  it('uses equivalent fallback-date and relation-search predicates for count', () => {
    const where = buildAdCampaignListWhere('workspace-1', {
      search: 'scale',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    });

    expect(where.workspaceId).toBe('workspace-1');
    expect(JSON.stringify(where)).toContain('"placementDate"');
    expect(JSON.stringify(where)).toContain('"hypothesisLinks"');
    expect(where.AND).toHaveLength(2);
  });
});
