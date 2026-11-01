import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
export function manualFingerprint(
  userId: string,
  contactId: string,
  input: unknown,
) {
  return createHash('sha256')
    .update(JSON.stringify({ userId, contactId, input }))
    .digest('hex');
}
export function requireNewManualOperation(
  operationId: string,
  now = new Date(),
) {
  if (
    !/^\d{4}-\d{2}-\d{2}:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      operationId,
    )
  )
    throw new BadRequestException('MANUAL_OPERATION_ID_INVALID');
  if (operationId.slice(0, 10) !== now.toISOString().slice(0, 10))
    throw new ConflictException(
      'MANUAL_OPERATION_EXPIRED_CREATE_A_NEW_OPERATION',
    );
}
export function manualFactDate(input?: string) {
  const at = input ? new Date(input) : new Date();
  if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now())
    throw new BadRequestException('MANUAL_ACTIVITY_DATE_INVALID');
  return at;
}

export async function manualEditScope(
  crm: {
    readScope(
      userId: string,
    ): Promise<{ workspaceId: string; ownerMemberId?: string }>;
    editScope(
      userId: string,
    ): Promise<{ workspaceId: string; ownerMemberId?: string }>;
  },
  userId: string,
) {
  const [read, edit] = await Promise.all([
    crm.readScope(userId),
    crm.editScope(userId),
  ]);
  return {
    workspaceId: edit.workspaceId,
    ownerMemberId: edit.ownerMemberId ?? read.ownerMemberId,
  };
}
