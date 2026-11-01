import { crmChatRollout } from './deployment-config';
describe('chat rollout', () => {
  it('defaults off without disabling legacy manual text', () =>
    expect(crmChatRollout({})).toEqual({ actions: false, media: false }));
  it('explicitly enables actions and separately media', () =>
    expect(
      crmChatRollout({
        CRM_CHAT_ACTIONS_ENABLED: 'true',
        CRM_CHAT_MEDIA_ENABLED: 'false',
      }),
    ).toEqual({ actions: true, media: false }));
  it('rejects invalid deployment booleans', () =>
    expect(() => crmChatRollout({ CRM_CHAT_ACTIONS_ENABLED: 'yes' })).toThrow(
      'must be true or false',
    ));
});
