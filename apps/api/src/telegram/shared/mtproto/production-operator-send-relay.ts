import { Injectable } from '@nestjs/common';
import { productionRecoveryConfig } from '../../../config/production-recovery-config';
import { managedPostDeliveryContext } from '../../../domains/telegram/telegram-channels/telegram-managed-post-delivery-context';
import { journaledTelegramSend } from '../../../domains/telegram/telegram-channels/telegram-managed-post-send-journal.service';
import { operatorBotMethods } from '../../../domains/telegram/telegram-channels/telegram-operator-send.dto';
import { recoveryAuthorization } from './production-recovery-relay-context';

const botActorPrefix = 'operator-bot:';
export const operatorBotActor = (id: string) => botActorPrefix + id;

export async function relayOperatorSend<T>(
  actor: string,
  kind: 'mtproto' | (typeof operatorBotMethods)[number],
  payload: Record<string, unknown>,
) {
  const context = managedPostDeliveryContext.getStore();
  const journal = journaledTelegramSend.getStore();
  const authorization = recoveryAuthorization.getStore();
  const config = productionRecoveryConfig();
  if (!authorization || !journal || !context || journal.input.postId !== context.postId ||
      journal.input.sourceId !== actor || journal.input.channelId !== config.channelId ||
      journal.input.workspaceId !== config.workspaceId)
    throw new Error('Operator transport requires the exact active send operation and Telegram actor');
  context.signal.throwIfAborted();
  const response = await fetch(
    `${config.productionApiOrigin}/telegram-channels/${config.channelId}/operator-send`,
    {
      method: 'POST',
      redirect: 'error',
      headers: { authorization, 'x-workspace-id': config.workspaceId, 'content-type': 'application/json' },
      body: JSON.stringify({ operationId: journal.operationId, claimOwner: context.owner, kind, payload }),
      signal: context.signal,
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Railway did not confirm the journaled send (HTTP ${response.status})`);
  }
  return ((await response.json()) as { result: T }).result;
}

@Injectable()
export class ProductionOperatorBotRelay {
  call<T>(token: string, method: string, body: Record<string, unknown>) {
    const kind = operatorBotMethods.find((name) => name === method);
    if (!token.startsWith(botActorPrefix) || !kind)
      throw new Error('Bot operation is outside the operator publication transport');
    return relayOperatorSend<T>(token.slice(botActorPrefix.length), kind, { method, body });
  }

  editMessageReplyMarkup() {
    throw new Error('Separate Telegram message edits are outside the operator publication transport');
  }
}
