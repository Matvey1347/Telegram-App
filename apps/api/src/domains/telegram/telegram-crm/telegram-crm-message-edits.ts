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
  context: { workspaceId: string; accountId: string },
) {
  const changes: Array<{
    input: CrmMessageBatchInput;
    current: Existing;
    text: string | null;
    editedAt: Date | null;
    metadata: Prisma.InputJsonObject;
  }> = [];
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
    changes.push({
      input,
      current,
      text: nextText,
      editedAt: nextEditedAt,
      metadata: nextMetadata,
    });
  }
  const updatedIds: string[] = [];
  // One bounded UPDATE per page, rather than two remote DB round trips per row.
  for (let offset = 0; offset < changes.length; offset += 100) {
    const page = changes.slice(offset, offset + 100);
    const updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "TelegramCrmMessage" AS message
      SET "text" = incoming."text", "editedAt" = incoming."editedAt", "contentMetadata" = incoming."metadata"
      FROM (VALUES ${Prisma.join(
        page.map(
          (change) => Prisma.sql`(
        CAST(${change.current.id} AS TEXT), CAST(${change.current.editedAt} AS TIMESTAMP(3)),
        CAST(${change.text} AS TEXT), CAST(${change.editedAt} AS TIMESTAMP(3)), CAST(${JSON.stringify(change.metadata)} AS JSONB)
      )`,
        ),
      )}) AS incoming("id", "expectedEditedAt", "text", "editedAt", "metadata")
      WHERE message."id" = incoming."id"
        AND message."workspaceId" = ${context.workspaceId}
        AND message."mtprotoAccountId" = ${context.accountId}
        AND message."deletedAt" IS NULL
        AND message."editedAt" IS NOT DISTINCT FROM incoming."expectedEditedAt"
      RETURNING message."id"
    `);
    updatedIds.push(...updated.map((row) => row.id));
  }
  const winners = new Set(updatedIds);
  const editedMessages = updatedIds.length
    ? await tx.telegramCrmMessage.findMany({
        where: {
          workspaceId: context.workspaceId,
          mtprotoAccountId: context.accountId,
          id: { in: updatedIds },
        },
        select: crmMessageSelect,
      })
    : [];
  return {
    edited: updatedIds.length,
    editedMessages,
    editedInputs: changes
      .filter((change) => winners.has(change.current.id))
      .map((change) => change.input),
  };
}
