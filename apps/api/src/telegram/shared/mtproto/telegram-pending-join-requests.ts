import { Api, TelegramClient } from 'telegram';

type PendingJoinRequestsResponse = {
  count?: unknown;
};

/**
 * ChannelFull.requestsPending can lag behind after administrators approve a
 * batch. Telegram's requested-importers query is the authoritative live queue.
 */
export async function livePending(
  client: TelegramClient,
  peer: Api.TypeEntityLike,
  fullChannel: unknown,
  run: <T>(request: Promise<T>) => Promise<T> = (request) => request,
) {
  void fullChannel; // Metadata is not a verified live queue, even when nonzero.
  try {
    const response = (await run(
      client.invoke(
        new Api.messages.GetChatInviteImporters({
          peer,
          requested: true,
          offsetDate: 0,
          offsetUser: new Api.InputUserEmpty(),
          limit: 1,
        }),
      ),
    )) as PendingJoinRequestsResponse;
    const count = response.count;
    return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null;
  } catch {
    return null;
  }
}
