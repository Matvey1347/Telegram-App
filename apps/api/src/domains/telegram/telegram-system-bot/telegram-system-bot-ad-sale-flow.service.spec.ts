/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- stateful workflow doubles */
import {
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { TelegramSystemBotAdSaleFlowService } from './telegram-system-bot-ad-sale-flow.service';

const scope = {
  connectionId: 'connection-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  telegramUserId: 'telegram-user-1',
  chatId: 'telegram-user-1',
  timezone: 'Europe/Warsaw',
};

function setup(input?: { step?: string; payload?: Record<string, unknown> }) {
  let workflow: any = {
    id: 'workflow-1',
    connectionId: scope.connectionId,
    workspaceId: scope.workspaceId,
    kind: TelegramSystemBotWorkflowKind.AD_SALE,
    status: TelegramSystemBotWorkflowStatus.ACTIVE,
    step: input?.step ?? 'CHOOSE_SALE_MODE',
    payload: input?.payload ?? {},
    version: 3,
    controlMessageId: 99,
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    resultManagedPostId: null,
    resultAdSaleId: null,
    resultAdSalePlacementId: null,
    lastError: null,
  };
  const update = (patch: Record<string, unknown>) => {
    workflow = { ...workflow, ...patch, version: workflow.version + 1 };
    return workflow;
  };
  const workflows = {
    active: jest.fn(async () => workflow),
    get: jest.fn(async () => workflow),
    create: jest.fn(async (value) => update(value)),
    transition: jest.fn(async (value) =>
      update({
        step: value.step,
        payload: value.payload,
        ...(value.controlMessageId === undefined
          ? {}
          : { controlMessageId: value.controlMessageId }),
      }),
    ),
    cancel: jest.fn(async () =>
      update({ status: TelegramSystemBotWorkflowStatus.CANCELLED }),
    ),
    retry: jest.fn(async () =>
      update({ status: TelegramSystemBotWorkflowStatus.ACTIVE }),
    ),
    claimCommit: jest.fn(async () =>
      update({ status: TelegramSystemBotWorkflowStatus.COMMITTING }),
    ),
    fail: jest.fn(async (value) =>
      update({
        status: TelegramSystemBotWorkflowStatus.FAILED,
        lastError: value.error,
      }),
    ),
    complete: jest.fn(async (value) =>
      update({
        status: TelegramSystemBotWorkflowStatus.COMPLETED,
        resultManagedPostId: value.resultManagedPostId,
        resultAdSaleId: value.resultAdSaleId,
        resultAdSalePlacementId: value.resultAdSalePlacementId,
      }),
    ),
  };
  const api = {
    editMessageText: jest.fn().mockResolvedValue({ message_id: 99 }),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 99 }),
  };
  const postContent = {
    capture: jest.fn().mockResolvedValue({
      ok: true,
      content: {
        text: 'Advertising copy',
        imageUrls: [],
        buttonRows: [[{ text: 'Open', url: 'https://example.com' }]],
        mediaGroupId: null,
        sourceTitle: 'Source',
        warnings: [],
      },
    }),
    removeInput: jest.fn(),
  };
  const command = {
    options: jest.fn().mockResolvedValue({
      currentMember: { id: 'member-1', name: 'Ada' },
      accounts: [{ id: 'account-1', name: 'Main', currency: 'USD' }],
      members: [
        { id: 'member-1', name: 'Ada' },
        { id: 'member-2', name: 'Bob' },
      ],
    }),
    commit: jest.fn().mockResolvedValue({
      saleId: 'sale-1',
      placements: [
        {
          placementId: 'placement-1',
          managedPostId: 'post-1',
          placementStatus: 'SCHEDULED',
        },
      ],
      deliveryAction: 'SCHEDULE',
    }),
  };
  const targets = {
    options: jest.fn().mockResolvedValue({
      channels: [
        { id: 'channel-1', title: 'News' },
        { id: 'channel-2', title: 'Media' },
      ],
      networks: [
        {
          id: 'network-1',
          name: 'Network',
          channelCount: 2,
          selectable: true,
        },
      ],
    }),
    resolve: jest.fn().mockResolvedValue({
      formats: [{ name: '1/24' }, { name: 'No auto-delete' }],
    }),
    existingManagedPosts: jest.fn().mockResolvedValue([
      { id: 'managed-1', title: 'Prepared ad', status: 'DRAFT' },
    ]),
  };
  const placement = {
    placementId: 'existing-placement',
    saleLabel: 'Advertiser',
    channelTitle: 'News',
    channelId: 'channel-1',
    productLabel: '1/24',
    scheduledLabel: '25 Aug, 18:00',
    label: 'Advertiser · News · 1/24',
  };
  const placements = {
    list: jest.fn().mockResolvedValue([placement]),
    resolve: jest.fn().mockResolvedValue(placement),
  };
  const moduleRef = {
    registerRequestByContextId: jest.fn(),
    resolve: jest.fn(async (token) => {
      if (token.name.includes('Targets')) return targets;
      if (token.name.includes('PlacementOptions')) return placements;
      return command;
    }),
  };
  const service = new TelegramSystemBotAdSaleFlowService(
    { token: 'token' } as never,
    api as never,
    workflows as never,
    postContent as never,
    moduleRef as never,
  );
  return {
    service,
    api,
    workflows,
    postContent,
    command,
    targets,
    placements,
    current: () => workflow,
  };
}

function callback(current: { id: string; version: number }, action: string) {
  return `sba:${current.id}:${current.version}:${action}`;
}

describe('TelegramSystemBotAdSaleFlowService', () => {
  it('starts with sale mode and auto-selects the current member for a new sale', async () => {
    const state = setup();
    await state.service.begin(scope);
    expect(state.current().step).toBe('CHOOSE_SALE_MODE');

    await state.service.callback(scope, callback(state.current(), 'mode.new'));

    expect(state.current()).toMatchObject({
      step: 'CHOOSE_ACCOUNT',
      payload: {
        mode: 'NEW',
        assignedMemberId: 'member-1',
        memberLabel: 'Ada',
      },
    });
  });

  it('allows changing member and skipping Finance', async () => {
    const state = setup({
      step: 'CHOOSE_ACCOUNT',
      payload: { mode: 'NEW', assignedMemberId: 'member-1', memberLabel: 'Ada' },
    });
    await state.service.callback(
      scope,
      callback(state.current(), 'member.change'),
    );
    await state.service.callback(scope, callback(state.current(), 'member.1'));
    await state.service.callback(
      scope,
      callback(state.current(), 'finance.skip'),
    );

    expect(state.current()).toMatchObject({
      step: 'CHOOSE_TARGET',
      payload: {
        assignedMemberId: 'member-2',
        memberLabel: 'Bob',
        financeSkipped: true,
      },
    });
  });

  it('toggles multiple own channels and continues with the union target', async () => {
    const state = setup({
      step: 'CHOOSE_TARGET',
      payload: { mode: 'NEW', assignedMemberId: 'member-1', financeSkipped: true },
    });
    await state.service.callback(
      scope,
      callback(state.current(), 'target.channel.0'),
    );
    await state.service.callback(
      scope,
      callback(state.current(), 'target.channel.1'),
    );
    await state.service.callback(
      scope,
      callback(state.current(), 'target.continue'),
    );

    expect(state.current()).toMatchObject({
      step: 'CHOOSE_CONTENT',
      payload: {
        target: {
          kind: 'CHANNELS',
          channelIds: ['channel-1', 'channel-2'],
          labels: ['News', 'Media'],
        },
      },
    });
    expect(state.targets.resolve).toHaveBeenCalledWith('user-1', {
      kind: 'CHANNELS',
      channelIds: ['channel-1', 'channel-2'],
    });
  });

  it('selects one network target and proceeds without an amount when Finance is skipped', async () => {
    const state = setup({
      step: 'CHOOSE_TARGET',
      payload: { mode: 'NEW', assignedMemberId: 'member-1', financeSkipped: true },
    });

    await state.service.callback(
      scope,
      callback(state.current(), 'target.network.0'),
    );

    expect(state.current()).toMatchObject({
      step: 'CHOOSE_CONTENT',
      payload: {
        target: { kind: 'NETWORK', networkId: 'network-1', label: 'Network' },
      },
    });
  });

  it('selects an existing managed post only for a resolved direct target', async () => {
    const state = setup({
      step: 'CHOOSE_CONTENT',
      payload: {
        mode: 'NEW',
        assignedMemberId: 'member-1',
        financeSkipped: true,
        target: { kind: 'CHANNELS', channelIds: ['channel-1'], labels: ['News'] },
      },
    });
    await state.service.callback(
      scope,
      callback(state.current(), 'content.existing'),
    );
    await state.service.callback(
      scope,
      callback(state.current(), 'managedpost.0'),
    );

    expect(state.current()).toMatchObject({
      step: 'CHOOSE_FORMAT',
      payload: {
        existingManagedPostId: 'managed-1',
        existingManagedPostLabel: 'Prepared ad',
      },
    });
    expect(state.targets.existingManagedPosts).toHaveBeenCalledWith('user-1', {
      kind: 'CHANNELS',
      channelIds: ['channel-1'],
    });
  });

  it('re-resolves an existing placement on selection and immediately before commit', async () => {
    const state = setup({ step: 'CHOOSE_EXISTING_PLACEMENT', payload: { mode: 'EXISTING' } });
    await state.service.callback(scope, callback(state.current(), 'placement.0'));
    expect(state.current()).toMatchObject({
      step: 'CHOOSE_CONTENT',
      payload: {
        existingPlacementId: 'existing-placement',
        existingSaleLabel: 'Advertiser',
      },
    });
    state.current().step = 'CONFIRM';
    state.current().payload = {
      ...state.current().payload,
      deliveryAction: 'PUBLISH_NOW',
      content: {
        text: 'Ad',
        imageUrls: [],
        buttonRows: [],
        mediaGroupId: null,
        sourceTitle: null,
        warnings: [],
      },
    };
    await state.service.callback(scope, callback(state.current(), 'confirm'));

    expect(state.placements.resolve).toHaveBeenCalledTimes(2);
    expect(state.command.commit).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        commandId: 'workflow-1',
        existingPlacementId: 'existing-placement',
      }),
    );
  });

  it('publishes now without prompting for a date', async () => {
    const state = setup({
      step: 'CHOOSE_DELIVERY',
      payload: completeNewPayload(),
    });
    await state.service.callback(
      scope,
      callback(state.current(), 'delivery.publish'),
    );
    expect(state.current()).toMatchObject({
      step: 'CONFIRM',
      payload: { deliveryAction: 'PUBLISH_NOW' },
    });
    expect(state.current().payload.scheduledAt).toBeUndefined();
  });

  it('asks for a future date only after Schedule and commits it', async () => {
    const state = setup({
      step: 'CHOOSE_DELIVERY',
      payload: completeNewPayload(),
    });
    await state.service.callback(
      scope,
      callback(state.current(), 'delivery.schedule'),
    );
    expect(state.current().step).toBe('AWAIT_SCHEDULE');
    await state.service.input(scope, {
      message_id: 10,
      text: '25.08.2099 18:30',
    });
    expect(state.current()).toMatchObject({
      step: 'CONFIRM',
      payload: { deliveryAction: 'SCHEDULE' },
    });
    expect(state.current().payload.scheduledAt).toMatch(/^2099-08-25T/);
  });

  it('keeps forwarded buttons in the single edited control card', async () => {
    const state = setup({
      step: 'AWAIT_CONTENT',
      payload: {
        mode: 'NEW',
        assignedMemberId: 'member-1',
        financeSkipped: true,
        target: { kind: 'CHANNELS', channelIds: ['channel-1'], labels: ['News'] },
      },
    });
    await state.service.input(scope, { message_id: 11, text: 'Ad' });
    expect(state.current().step).toBe('CHOOSE_FORMAT');
    expect(JSON.stringify(state.api.editMessageText.mock.calls.at(-1)?.[1])).toContain(
      'https://example.com',
    );
    expect(state.api.sendMessage).not.toHaveBeenCalled();
  });
});

function completeNewPayload() {
  return {
    mode: 'NEW',
    assignedMemberId: 'member-1',
    memberLabel: 'Ada',
    financeSkipped: true,
    target: { kind: 'CHANNELS', channelIds: ['channel-1'], labels: ['News'] },
    formatName: '1/24',
    content: {
      text: 'Ad',
      imageUrls: [],
      buttonRows: [],
      mediaGroupId: null,
      sourceTitle: null,
      warnings: [],
    },
  };
}
