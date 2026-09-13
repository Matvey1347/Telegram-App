import { buildAdHypothesisListWhere } from './ad-hypothesis-list-query';

describe('buildAdHypothesisListWhere', () => {
  it('filters hypotheses by all channels selected through an Ads scope', () => {
    expect(
      buildAdHypothesisListWhere('workspace-1', {
        telegramChannelIds: 'channel-1,channel-2',
      }),
    ).toMatchObject({
      workspaceId: 'workspace-1',
      telegramChannel: {
        is: { archivedAt: null, adminLinks: { some: {} } },
      },
      telegramChannelId: { in: ['channel-1', 'channel-2'] },
    });
  });

  it('never returns a manual hypothesis for a channel the workspace does not own', () => {
    expect(buildAdHypothesisListWhere('workspace-1', {})).toMatchObject({
      workspaceId: 'workspace-1',
      telegramChannel: {
        is: { archivedAt: null, adminLinks: { some: {} } },
      },
    });
  });
});
