import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { FinancePrismaService } from '../prisma/finance-prisma.service';
import type { FinanceSession } from '../identity/finance-session.service';

@Injectable()
export class FinanceLedgerService {
  constructor(private readonly prisma: FinancePrismaService) {}

  async createAccount(session: FinanceSession, input: { name: string; currency: string }) {
    const name = input.name?.trim();
    const currency = input.currency?.trim().toUpperCase();
    if (!name || !currency || !/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('A name and ISO currency are required');
    }
    return this.prisma.financeAccount.create({
      data: { profileId: session.profileId, name, currency },
      select: { id: true, name: true, currency: true, balanceMinor: true },
    });
  }

  async createTransaction(
    session: FinanceSession,
    input: {
      accountId: string;
      kind: 'INCOME' | 'EXPENSE';
      amountMinor: string;
      economicAmountMinor: string;
      occurredAt?: string;
    },
  ) {
    const amountMinor = parseMinor(input.amountMinor, 'amountMinor');
    const economicAmountMinor = parseMinor(input.economicAmountMinor, 'economicAmountMinor');
    if (amountMinor <= 0n || economicAmountMinor < 0n || economicAmountMinor > amountMinor) {
      throw new BadRequestException('Invalid monetary amounts');
    }
    if (input.kind !== 'INCOME' && input.kind !== 'EXPENSE') {
      throw new BadRequestException('Invalid transaction kind');
    }
    const account = await this.prisma.financeAccount.findFirst({
      where: { id: input.accountId, profileId: session.profileId },
      select: { id: true },
    });
    if (!account) throw new ForbiddenException('Account does not belong to this Finance profile');
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) throw new BadRequestException('Invalid occurredAt');
    return this.prisma.$transaction(async (tx) => {
      const signedAmount = input.kind === 'EXPENSE' ? -amountMinor : amountMinor;
      const transaction = await tx.financeTransaction.create({
        data: {
          profileId: session.profileId,
          accountId: account.id,
          kind: input.kind,
          amountMinor,
          economicAmountMinor,
          occurredAt,
        },
        select: { id: true, kind: true, amountMinor: true, economicAmountMinor: true, occurredAt: true },
      });
      await tx.financeAccount.update({
        where: { id: account.id },
        data: { balanceMinor: { increment: signedAmount } },
      });
      return transaction;
    });
  }
}

function parseMinor(value: string, name: string) {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    throw new BadRequestException(`${name} must be an integer minor-unit string`);
  }
  return BigInt(value);
}
