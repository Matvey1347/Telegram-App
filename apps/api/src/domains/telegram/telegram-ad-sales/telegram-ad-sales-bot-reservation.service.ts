import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TelegramAdSaleStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  TelegramAdSalesBotCommitInput,
  TelegramAdSalesBotSale,
} from './telegram-ad-sales-bot-command.types';
import { TelegramAdSalesCheckoutService } from './telegram-ad-sales-checkout.service';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

@Injectable()
export class TelegramAdSalesBotReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: TelegramAdSalesCheckoutService,
    private readonly sales: TelegramAdSalesService,
  ) {}

  async reserve(input: {
    userId: string;
    workspaceId: string;
    commandId: string;
    command: TelegramAdSalesBotCommitInput;
    reservation: Omit<
      Parameters<TelegramAdSalesCheckoutService['reserveWithoutPayment']>[1],
      'idempotencyKey' | 'financeSkipped'
    >;
    account: { id: string; currency: string } | null;
  }) {
    const idempotencyKey = `system-bot-ad-sale:${input.commandId}`;
    let sale = input.command.existingSaleId
      ? await this.resumeSale(
          input.userId,
          input.workspaceId,
          input.command.existingSaleId,
          idempotencyKey,
          Boolean(input.command.finance),
        )
      : input.command.finance && input.account
        ? await this.checkoutOrResume(input.userId, input.workspaceId, {
            ...input.reservation,
            payment: {
              accountId: input.account.id,
              amount: input.command.finance.amount,
              currency: input.account.currency,
              paidAt: this.paidAt(input.command.finance.paidAt).toISOString(),
              notes: 'Recorded through Telegram System Bot',
              idempotencyKey,
            },
          })
        : await this.reserveWithoutPaymentOrResume(
            input.userId,
            input.workspaceId,
            {
              ...input.reservation,
              idempotencyKey,
              financeSkipped: true,
            },
          );
    sale = await this.confirm(input.userId, sale);
    return { sale, idempotencyKey };
  }

  async confirm(userId: string, sale: TelegramAdSalesBotSale) {
    if (sale.status === TelegramAdSaleStatus.RESERVED) {
      return (await this.sales.confirmSale(
        userId,
        sale.id,
      )) as TelegramAdSalesBotSale;
    }
    if (
      sale.status !== TelegramAdSaleStatus.CONFIRMED &&
      sale.status !== TelegramAdSaleStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Bot command cannot resume sale in ${sale.status} status`,
      );
    }
    return sale;
  }

  private async checkoutOrResume(
    userId: string,
    workspaceId: string,
    dto: Parameters<TelegramAdSalesCheckoutService['create']>[1],
  ) {
    try {
      return (await this.checkout.create(
        userId,
        dto,
      )) as TelegramAdSalesBotSale;
    } catch (error) {
      if (!this.isUniqueViolation(error) || !dto.payment.idempotencyKey)
        throw error;
      const payment = await this.prisma.telegramAdSalePayment.findFirst({
        where: { workspaceId, idempotencyKey: dto.payment.idempotencyKey },
        select: { telegramAdSaleId: true },
      });
      if (!payment) throw error;
      return (await this.sales.getSale(
        userId,
        payment.telegramAdSaleId,
      )) as TelegramAdSalesBotSale;
    }
  }

  private async reserveWithoutPaymentOrResume(
    userId: string,
    workspaceId: string,
    dto: Parameters<TelegramAdSalesCheckoutService['reserveWithoutPayment']>[1],
  ) {
    try {
      return (await this.checkout.reserveWithoutPayment(
        userId,
        dto,
      )) as TelegramAdSalesBotSale;
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const sale = await this.prisma.telegramAdSale.findFirst({
        where: { workspaceId, idempotencyKey: dto.idempotencyKey },
        select: { id: true },
      });
      if (!sale) throw error;
      return (await this.sales.getSale(
        userId,
        sale.id,
      )) as TelegramAdSalesBotSale;
    }
  }

  private async resumeSale(
    userId: string,
    workspaceId: string,
    saleId: string,
    idempotencyKey: string,
    requiresPayment: boolean,
  ) {
    const sale = (await this.sales.getSale(
      userId,
      saleId,
    )) as TelegramAdSalesBotSale;
    const ownsCommand = requiresPayment
      ? sale.payments?.some((item) => item.idempotencyKey === idempotencyKey)
      : await this.prisma.telegramAdSale.findFirst({
          where: { id: saleId, workspaceId, idempotencyKey },
          select: { id: true },
        });
    if (!ownsCommand) {
      throw new BadRequestException(
        'Existing sale does not belong to this bot command',
      );
    }
    return sale;
  }

  private paidAt(value?: string) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('paidAt must be a valid timestamp');
    }
    return date;
  }

  private isUniqueViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
