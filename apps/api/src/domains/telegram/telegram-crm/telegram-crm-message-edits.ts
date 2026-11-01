import { manualReceiptMetadata } from './telegram-crm-chat-store.service';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import type {
  CrmMessageBatchInput,
  CrmMessageBatchMode,
} from './telegram-crm-message-batch-writer.service';
import { crmMessageSelect } from './telegram-crm-message.mapper';
type MessageRow = Prisma.TelegramCrmMessageGetPayload<{
  select: typeof crmMessageSelect;
}>;
type Existing = Pick<
  MessageRow,
  'id' | 'text' | 'editedAt' | 'deletedAt' | 'contentMetadata' | 'origin'
>;
export async function applyCrmMessageEdits(
  tx: Prisma.TransactionClient,
  inputs: CrmMessageBatchInput[],
  existingByKey: Map<string, Existing>,
  mode: CrmMessageBatchMode,
) {
  let edited = 0;
  const editedMessages: MessageRow[] = [];
  const editedInputs: CrmMessageBatchInput[] = [];
  for (const input of inputs) {
    const current = existingByKey.get(
      `${input.conversation.id}:${input.message.telegramMessageId}`,
    );
    if (!current || current.deletedAt) continue;
    const incomingDate = input.message.editedAt?.getTime() ?? 0;
    const currentDate = current.editedAt?.getTime() ?? 0;
    if (!input.metadataOnly && incomingDate < currentDate) continue;
    // A fetched history page is an authoritative snapshot, including media on
    // legacy unedited rows. Live new-message replays still cannot overwrite it.
    if (
      mode !== 'history' &&
      !input.edited &&
      !input.metadataOnly &&
      !incomingDate
    )
      continue;
    const previousMetadata =
      current.contentMetadata &&
      typeof current.contentMetadata === 'object' &&
      !Array.isArray(current.contentMetadata)
        ? current.contentMetadata
        : {};
    const nextMetadata = {
      ...input.message.contentMetadata,
      ...manualReceiptMetadata(current.contentMetadata),
      ...(!input.metadataOnly ? { telegramText: true } : {}),
    };
    const nextText = input.metadataOnly ? current.text : input.message.text;
    const nextEditedAt = input.metadataOnly
      ? current.editedAt
      : input.message.editedAt;
    if (
      current.text === nextText &&
      current.editedAt?.getTime() === nextEditedAt?.getTime() &&
      isDeepStrictEqual(previousMetadata, nextMetadata)
    )
      continue;
    const applied = await tx.telegramCrmMessage.updateMany({
      where: { id: current.id, deletedAt: null, editedAt: current.editedAt },
      data: {
        text: nextText,
        editedAt: nextEditedAt,
        contentMetadata: nextMetadata,
      },
    });
    if (!applied.count) continue;
    const updated = await tx.telegramCrmMessage.findUniqueOrThrow({
      where: { id: current.id },
      select: crmMessageSelect,
    });
    editedMessages.push(updated);
    edited += 1;
    editedInputs.push(input);
  }
  return { edited, editedMessages, editedInputs };
}
