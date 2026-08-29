import {
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { renderTelegramSystemBotAdSaleCard } from './telegram-system-bot-ad-sale-flow.presentation';
import { renderTelegramSystemBotPostCard } from './telegram-system-bot-post-flow.presentation';

const scope = {
  connectionId: 'connection-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  telegramUserId: 'telegram-user-1',
  chatId: 'chat-1',
  timezone: 'UTC',
};

function workflow(kind: TelegramSystemBotWorkflowKind, step: string) {
  return {
    id: 'workflow-1',
    connectionId: scope.connectionId,
    workspaceId: scope.workspaceId,
    kind,
    step,
    status: TelegramSystemBotWorkflowStatus.ACTIVE,
    version: 1,
    payload: {},
  } as never;
}

describe('Telegram System Bot option layouts', () => {
  it('packs post channels into two columns', () => {
    const card = renderTelegramSystemBotPostCard({
      workflow: workflow(
        TelegramSystemBotWorkflowKind.POST_IMPORT,
        'CHOOSE_CHANNEL',
      ),
      scope,
      payload: {},
      channels: Array.from({ length: 5 }, (_, index) => ({
        id: `channel-${index}`,
        title: `Channel ${index}`,
      })),
    });

    if (!('reply_markup' in card)) throw new Error('Expected post controls');
    expect(card.reply_markup?.inline_keyboard.map((row) => row.length)).toEqual(
      [2, 2, 1, 2],
    );
  });

  it.each([
    ['CHOOSE_ACCOUNT', [2, 2, 1, 1, 1, 2]],
    ['CHOOSE_MEMBER', [2, 2, 1, 2]],
    ['CHOOSE_TARGET', [2, 2, 1, 2]],
    ['CHOOSE_FORMAT', [2, 2, 1, 2]],
  ])('packs Ad Sale %s options into compact rows', (step, expected) => {
    const card = renderTelegramSystemBotAdSaleCard({
      workflow: workflow(TelegramSystemBotWorkflowKind.AD_SALE, step),
      scope,
      payload: {},
      options: {
        currentMember: { id: 'member-0', name: 'Member 0' },
        accounts: Array.from({ length: 5 }, (_, index) => ({
          id: `account-${index}`,
          name: `Account ${index}`,
          currency: 'USD',
        })),
        members: Array.from({ length: 5 }, (_, index) => ({
          id: `member-${index}`,
          name: `Member ${index}`,
        })),
        channels: Array.from({ length: 5 }, (_, index) => ({
          id: `channel-${index}`,
          title: `Channel ${index}`,
        })),
        formats: [
          { name: '1/24' },
          { name: '2/48' },
          { name: '3/72' },
          { name: 'No auto-delete' },
          { name: '1/24' },
        ],
      },
    });

    expect(card.reply_markup?.inline_keyboard.map((row) => row.length)).toEqual(
      expected,
    );
  });

  it('shows the account emoji and assigned member in Ad Sale choices', () => {
    const card = renderTelegramSystemBotAdSaleCard({
      workflow: workflow(
        TelegramSystemBotWorkflowKind.AD_SALE,
        'CHOOSE_ACCOUNT',
      ),
      scope,
      payload: {},
      options: {
        currentMember: { id: 'member-1', name: 'Member' },
        accounts: [
          {
            id: 'account-1',
            name: 'Poland Card',
            currency: 'PLN',
            assignedMemberName: 'Sasha',
            iconPresentation: { type: 'unicode', value: '🇵🇱' },
          },
        ],
        members: [],
        channels: [],
      },
    });

    expect(card.reply_markup?.inline_keyboard[0][0].text).toBe(
      '🇵🇱 Poland Card · Sasha (PLN)',
    );
  });
});
