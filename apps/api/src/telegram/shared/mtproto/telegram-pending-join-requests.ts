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
  const reportedCount = Number(
    (fullChannel as { requestsPending?: unknown } | null)?.requestsPending,
  );
  const fallback =
    Number.isFinite(reportedCount) && reportedCount >= 0
      ? Math.trunc(reportedCount)
      : null;
  if (!fallback) return fallback;
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
    const count = Number(response.count);
    return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : fallback;
  } catch {
    return fallback;
  }
}
