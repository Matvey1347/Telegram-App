import { Api } from 'telegram';

export function assertScheduledCancellationAck(
  result: Api.TypeUpdates,
  peer: Api.TypeInputPeer,
  messageIds: string[],
) {
  const updates = result instanceof Api.UpdateShort ? [result.update] : 'updates' in result ? result.updates : [];
  const deleted = new Set(updates.flatMap((update) => {
    if (!(update instanceof Api.UpdateDeleteScheduledMessages) ||
        update.sentMessages !== undefined ||
        !(peer instanceof Api.InputPeerChannel) || !(update.peer instanceof Api.PeerChannel) ||
        !peer.channelId.equals(update.peer.channelId)) return [];
    return update.messages;
  }));
  if (messageIds.some((id) => !deleted.has(Number(id))))
    throw new Error('Telegram did not acknowledge every scheduled ID.');
}
