import { BadRequestException } from '@nestjs/common';

type ContextCursor = {
  kind: 'purchases' | 'products';
  id: string;
  createdAt?: string;
};
export function encodeSalesContextCursor(value: ContextCursor) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
export function decodeSalesContextCursor(
  value: string | undefined,
  kind: ContextCursor['kind'],
) {
  if (!value) return null;
  try {
    if (value.length > 1024) throw new Error();
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error();
    const record = parsed as Record<string, unknown>;
    if (
      record.kind !== kind ||
      typeof record.id !== 'string' ||
      !record.id ||
      record.id.length > 128
    )
      throw new Error();
    if (
      kind === 'purchases' &&
      (typeof record.createdAt !== 'string' ||
        !Number.isFinite(new Date(record.createdAt).getTime()) ||
        new Date(record.createdAt).toISOString() !== record.createdAt)
    )
      throw new Error();
    return record as ContextCursor;
  } catch {
    throw new BadRequestException(`Invalid CRM ${kind} cursor`);
  }
}
export function salesContextLimit(value: number | undefined) {
  if (value !== undefined && (!Number.isInteger(value) || value < 1))
    throw new BadRequestException('Invalid CRM context page size');
  return Math.min(value ?? 20, 50);
}
