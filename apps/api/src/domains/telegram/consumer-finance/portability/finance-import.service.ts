import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ConsumerFinanceImportProgress,
  ConsumerFinanceImportResult,
} from '@telegram-system/shared';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { financeRequestFingerprint } from '../assets/finance-asset-idempotency';
import {
  TELEGRAM_BOT_DELIVERY_WRITER,
  type TelegramBotDeliveryWriterPort,
} from '../../telegram-bots/core/telegram-bot-delivery-writer';
import {
  FINANCE_OBLIGATION_PRESENTATION,
  type FinanceObligationPresentationPort,
} from '../obligations/finance-obligation-presentation.port';
import { prepareFinanceImportRates } from './finance-import-rates';
import { validateFinanceImportDocument } from './finance-import-validator';
import { writeFinanceImport } from './finance-import-writer';

type Progress = (
  item: ConsumerFinanceImportProgress,
  current: number,
  total: number,
) => void;

@Injectable()
export class FinanceImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion: CurrencyConversionService,
    @Inject(TELEGRAM_BOT_DELIVERY_WRITER)
    private readonly delivery: TelegramBotDeliveryWriterPort,
    @Inject(FINANCE_OBLIGATION_PRESENTATION)
    private readonly presentation: FinanceObligationPresentationPort,
  ) {}

  async import(
    profileId: string,
    input: unknown,
    onProgress: Progress,
    signal: AbortSignal,
  ): Promise<ConsumerFinanceImportResult> {
    onProgress(
      {
        phase: 'VALIDATING',
        section: 'document',
        processed: 0,
        total: 1,
      },
      0,
      15,
    );
    const document = validateFinanceImportDocument(input);
    const fingerprint = financeRequestFingerprint(document);
    if (document.mode === 'ADD') {
      const existing = await this.prisma.financeDataImportReceipt.findUnique({
        where: {
          profileId_requestFingerprint: {
            profileId,
            requestFingerprint: fingerprint,
          },
        },
      });
      if (existing) {
        return {
          importId: existing.id,
          duplicate: true,
          imported: existing.importedCount,
          counts: existing.counts as ConsumerFinanceImportResult['counts'],
          warnings: existing.warnings as string[],
        };
      }
    }
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: {
        defaultCurrency: true,
        botIntegration: { select: { workspaceId: true } },
      },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    onProgress(
      {
        phase: 'PREPARING',
        section: 'document',
        processed: 1,
        total: 1,
      },
      1,
      15,
    );
    const rates = await prepareFinanceImportRates({
      document,
      workspaceId: profile.botIntegration.workspaceId,
      defaultCurrency:
        document.settings?.defaultCurrency ?? profile.defaultCurrency,
      conversion: this.conversion,
      signal,
    });
    const write = await this.prisma.$transaction(
      (tx) =>
        writeFinanceImport({
          tx,
          profileId,
          document,
          rates,
          fingerprint,
          onProgress,
          signal,
          delivery: this.delivery,
          presentation: this.presentation,
        }),
      { maxWait: 10_000, timeout: 120_000 },
    );
    const earliest = write.scheduledAt.sort(
      (left, right) => left.getTime() - right.getTime(),
    )[0];
    if (earliest) this.delivery.notify(earliest);
    return write.result;
  }
}
