import { CrossPromotionPlanDraftService } from './cross-promotion-plan-draft.service';

function setup() {
  const prisma = {
    crossPromotionPlan: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const workspaceService = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
  };
  const readService = {
    shape: jest.fn((_workspaceId, plan) => plan),
  };
  return {
    prisma,
    readService,
    service: new CrossPromotionPlanDraftService(
      prisma as never,
      workspaceService as never,
      readService as never,
    ),
  };
}

describe('CrossPromotionPlanDraftService', () => {
  it('saves an entirely incomplete direct mutual promotion as a database draft', async () => {
    const { service, prisma } = setup();
    prisma.crossPromotionPlan.create.mockResolvedValue({ id: 'draft-1' });

    await expect(
      service.save('user-1', { kind: 'DIRECT_MUTUAL', draft: {} }),
    ).resolves.toEqual({ id: 'draft-1' });

    expect(prisma.crossPromotionPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        createdByUserId: 'user-1',
        kind: 'DIRECT_MUTUAL',
        title: 'Untitled mutual promotion',
        publisherChannelIds: [],
        partnerChannelIds: [],
        targets: [],
        status: 'DRAFT',
        publicationPost: expect.objectContaining({ formDraft: {} }),
      }),
    });
  });

  it('updates the same saved draft instead of creating a second one', async () => {
    const { service, prisma } = setup();
    prisma.crossPromotionPlan.findFirst.mockResolvedValue({ id: 'draft-1' });
    prisma.crossPromotionPlan.update.mockResolvedValue({ id: 'draft-1' });

    await service.save(
      'user-1',
      { kind: 'DIRECT_MUTUAL', draft: { title: 'Updated from mobile' } },
      'draft-1',
    );

    expect(prisma.crossPromotionPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'draft-1' } }),
    );
    expect(prisma.crossPromotionPlan.create).not.toHaveBeenCalled();
  });
});
