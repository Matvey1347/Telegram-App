import { parseFinanceFlowCallback } from './finance-bot-flow-callback';

describe('parseFinanceFlowCallback', () => {
  it('keeps selection ids, revision guards, and entity actions distinct', () => {
    expect(
      parseFinanceFlowCallback('fin:flow:account:account-1'),
    ).toMatchObject({
      action: 'account',
      callbackId: 'account-1',
      revision: undefined,
    });
    expect(
      parseFinanceFlowCallback('fin:flow:account:rev-1.account-1'),
    ).toMatchObject({
      callbackId: 'account-1',
      revision: 'rev-1',
    });
    expect(
      parseFinanceFlowCallback('fin:flow:edit-account:account-1'),
    ).toMatchObject({
      entityId: 'account-1',
    });
  });
});
