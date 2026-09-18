import {
  buildAdCampaignListWhere,
  buildAdCampaignPageIdQuery,
} from './ad-campaign-list-query';

describe('ad campaign server list query', () => {
  it.each([
    'date_desc',
    'date_asc',
    'cost_desc',
    'cost_asc',
    'joined_desc',
    'joined_asc',
  ] as const)('builds a bounded globally ordered page for %s', (sort) => {
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
  });

  it.each([
    ['cost_desc', 'DESC'],
    ['cost_asc', 'ASC'],
  ] as const)(
    'sorts primary-currency cost %s with a matching id tie-breaker',
    (sort, direction) => {
      const query = buildAdCampaignPageIdQuery('workspace-1', { sort }, 0, 50);
      const sql = query.strings.join('?');

      expect(sql).toContain(
        `campaign."priceInPrimaryCurrency" ${direction}, campaign."id" ${direction}`,
      );
    },
  );

  it.each([
    ['joined_desc', 'DESC'],
    ['joined_asc', 'ASC'],
  ] as const)(
    'sorts aggregate joins %s with one bounded scalar aggregate',
    (sort, direction) => {
      const query = buildAdCampaignPageIdQuery('workspace-1', { sort }, 0, 50);
      const sql = query.strings.join('?');

    expect(sql).toContain('COALESCE(');
    expect(sql).toContain('NULLIF(');
      expect(sql.match(/SELECT SUM\(link\."joinedCount"\)/gu)).toHaveLength(1);
      expect(sql).toContain(`campaign."id" ${direction}`);
    },
  );

  it('uses equivalent fallback-date and relation-search predicates for count', () => {
    const where = buildAdCampaignListWhere('workspace-1', {
      search: 'scale',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    });

    expect(where.workspaceId).toBe('workspace-1');
    expect(where.telegramChannel).toEqual({ archivedAt: null });
    expect(JSON.stringify(where)).toContain('"placementDate"');
    expect(JSON.stringify(where)).toContain('"hypothesisLinks"');
    expect(where.AND).toHaveLength(2);
  });

  it('filters both the id page and count predicate by a channel scope', () => {
    const filter = { telegramChannelIds: 'channel-1,channel-2' };
    const pageQuery = buildAdCampaignPageIdQuery('workspace-1', filter, 0, 50);
    const where = buildAdCampaignListWhere('workspace-1', filter);

    expect(pageQuery.strings.join('?')).toContain(
      'campaign."telegramChannelId" IN',
    );
    expect(pageQuery.strings.join('?')).toContain(
      'active_channel."archivedAt" IS NULL',
    );
    expect(pageQuery.values).toEqual(
      expect.arrayContaining(['channel-1', 'channel-2']),
    );
    expect(where.telegramChannelId).toEqual({
      in: ['channel-1', 'channel-2'],
    });
  });
});
