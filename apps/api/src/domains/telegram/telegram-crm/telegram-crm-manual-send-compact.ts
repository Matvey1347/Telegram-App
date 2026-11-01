import { Prisma } from '@prisma/client';

/** Preserve the later inbound/outbound facts when a slower protocol send commits. */
export async function advanceCrmManualSendCompact(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    conversationId: string;
    contactId: string | null;
    sentAt: Date;
    increment: boolean;
  },
) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE "TelegramCrmConversation"
    SET "lastMessageAt" = GREATEST("lastMessageAt", ${input.sentAt}),
        "lastOutboundAt" = GREATEST("lastOutboundAt", ${input.sentAt}),
        "outboundMessageCount" = "outboundMessageCount" + ${input.increment ? 1 : 0},
        "lastMeaningfulSyncAt" = NOW(), "updatedAt" = NOW()
    WHERE "id" = ${input.conversationId} AND "workspaceId" = ${input.workspaceId}
  `);
  if (input.contactId) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "TelegramAdvertiser"
      SET "lastContactAt" = GREATEST("lastContactAt", ${input.sentAt}),
          "lastOutboundAt" = GREATEST("lastOutboundAt", ${input.sentAt}), "updatedAt" = NOW()
      WHERE "id" = ${input.contactId} AND "workspaceId" = ${input.workspaceId}
    `);
  }
}
