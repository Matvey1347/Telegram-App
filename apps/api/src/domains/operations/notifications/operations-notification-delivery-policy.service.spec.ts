import type { OperationsNotificationType } from '@prisma/client';
import {
  OperationsNotificationDeliveryPolicyService,
  type OperationsNotificationDeliveryFact,
} from './operations-notification-delivery-policy.service';

const fact = (
  id: string,
  type = 'CRM_MESSAGE_RECEIVED' as OperationsNotificationType,
): OperationsNotificationDeliveryFact => ({
  id,
  type,
  workspaceId: 'workspace-current',
  recipientMemberId: 'member-current',
  metadata: {},
});

describe('OperationsNotificationDeliveryPolicyService', () => {
  it('batches domain facts and rejects ids outside the domain batch', async () => {
    const service = new OperationsNotificationDeliveryPolicyService();
    const filter = jest
      .fn()
      .mockResolvedValue(['allowed', 'injected-foreign-id']);
    service.register('CRM_MESSAGE_RECEIVED', filter);
    expect(
      await service.filter({} as never, [fact('allowed'), fact('denied')]),
    ).toEqual(new Set(['allowed']));
    expect(filter).toHaveBeenCalledTimes(1);
  });

  it('permits a future mock Support projector through the same domain-neutral infrastructure', async () => {
    const service = new OperationsNotificationDeliveryPolicyService();
    const supportType = 'MOCK_SUPPORT_MESSAGE' as OperationsNotificationType;
    const unregister = service.register(supportType, (_tx, facts) =>
      Promise.resolve(
        facts
          .filter(({ workspaceId }) => workspaceId === 'workspace-current')
          .map(({ id }) => id),
      ),
    );
    expect(
      await service.filter({} as never, [
        fact('support-current', supportType),
        {
          ...fact('support-foreign', supportType),
          workspaceId: 'workspace-foreign',
        },
        fact('generic', 'SYSTEM_TEST'),
      ]),
    ).toEqual(new Set(['support-current', 'generic']));
    unregister();
    expect(
      await service.filter({} as never, [fact('generic', supportType)]),
    ).toEqual(new Set(['generic']));
  });

  it('rejects duplicate policy registration and does no work in idle', async () => {
    const service = new OperationsNotificationDeliveryPolicyService();
    const policy = jest.fn().mockResolvedValue([]);
    service.register('CRM_MESSAGE_RECEIVED', policy);
    expect(() => service.register('CRM_MESSAGE_RECEIVED', policy)).toThrow();
    expect(await service.filter({} as never, [])).toEqual(new Set());
    expect(policy).not.toHaveBeenCalled();
  });
});
