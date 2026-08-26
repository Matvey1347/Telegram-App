export type TelegramBotDeliveryOperation = {
  method: string;
  body: Record<string, unknown>;
  expectedMessageCount: number;
  messageIds(result: unknown): string[];
};

type TelegramBotDeliveryInput = {
  operations: TelegramBotDeliveryOperation[];
  journaledMessageIds: string[];
  call(method: string, body: Record<string, unknown>): Promise<unknown>;
  persist(messageIds: string[]): Promise<void>;
  applyReplyMarkup?(lastMessageId: string): Promise<void>;
};

function isReplyMarkupAlreadyApplied(error: unknown) {
  return (
    error instanceof Error &&
    /message is not modified|reply markup.*not modified/i.test(error.message)
  );
}

/**
 * Delivers a deterministic Bot API message plan and journals each completed
 * operation before moving to the next external request. A retry skips the
 * durable prefix, so a failed follow-up or reply-markup edit cannot duplicate
 * messages that Telegram already accepted.
 */
export async function deliverTelegramManagedPostViaBot(
  input: TelegramBotDeliveryInput,
) {
  const messageIds = [...input.journaledMessageIds];
  let completedCount = 0;
  for (const operation of input.operations) {
    const operationEnd = completedCount + operation.expectedMessageCount;
    if (messageIds.length >= operationEnd) {
      completedCount = operationEnd;
      continue;
    }
    if (messageIds.length !== completedCount) {
      throw new Error('Telegram delivery journal is incomplete or inconsistent');
    }
    const createdIds = operation.messageIds(
      await input.call(operation.method, operation.body),
    );
    if (createdIds.length !== operation.expectedMessageCount) {
      throw new Error('Telegram returned an unexpected number of messages');
    }
    messageIds.push(...createdIds);
    await input.persist(messageIds);
    completedCount = operationEnd;
  }
  if (messageIds.length !== completedCount) {
    throw new Error('Telegram delivery journal does not match this post');
  }
  if (input.applyReplyMarkup && messageIds.length) {
    try {
      await input.applyReplyMarkup(messageIds.at(-1)!);
    } catch (error) {
      if (!isReplyMarkupAlreadyApplied(error)) throw error;
    }
  }
  return messageIds;
}
