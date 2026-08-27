import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService premium emoji presentation', () => {
  it('reuses an immutable Telegram asset stored by another workspace', async () => {
    const prisma = {
      workspaceMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'membership-1',
            workspaceId: 'workspace-1',
            role: 'OWNER',
            workspace: {
              id: 'workspace-1',
              name: 'Business',
              timezone: 'Europe/Warsaw',
              primaryCurrency: 'UAH',
              secondaryCurrency: 'USD',
              avatarIcon: {
                id: 'icon-1',
                type: 'emoji',
                name: 'premium alien',
                emoji: '![👽](tg://emoji?id=5368324170671202286)',
                imageUrl: null,
              },
            },
          },
        ]),
      },
      telegramCustomEmoji: {
        findMany: jest.fn().mockResolvedValue([
          {
            documentId: '5368324170671202286',
            kind: 'ANIMATED',
            assetUrl: 'https://cdn.example.com/alien.tgs',
            renderAssetUrl: 'https://cdn.example.com/alien.json',
            pack: { workspaceId: 'workspace-with-imported-pack' },
          },
        ]),
      },
    };
    const service = new WorkspacesService(
      prisma as never,
      {} as never,
    );

    const [workspace] = await service.findAll('user-1');

    expect(workspace.avatarPresentation).toMatchObject({
      type: 'unicode',
      value: '👽',
      telegramCustomEmojiKind: 'ANIMATED',
      telegramCustomEmojiRenderAssetUrl:
        'https://cdn.example.com/alien.json',
    });
  });
});
