import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ConsumerFinanceImportProgress,
  ConsumerFinanceImportResult,
  ConsumerFinancePortabilityHistory,
  ConsumerFinancePortabilityHistoryItem,
  ConsumerFinanceRollbackResult,
} from '@telegram-system/shared';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { HistoricalExchangeRateService } from '../../../../common/historical-exchange-rate.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { financeRequestFingerprint } from '../assets/finance-asset-idempotency';
import { financeDataSnapshot } from '../catalog/finance-portability';
import {
  TELEGRAM_BOT_DELIVERY_WRITER,
  type TelegramBotDeliveryWriterPort,
} from '../../telegram-bots/core/telegram-bot-delivery-writer';
import {
  FINANCE_OBLIGATION_PRESENTATION,
  type FinanceObligationPresentationPort,
} from '../obligations/finance-obligation-presentation.port';
import { prepareFinanceImportRates } from './finance-import-rates';
import { normalizeFinanceImportDocument } from './finance-import-normalizer';
import {
  decodeFinanceRollbackSnapshot,
  encodeFinanceRollbackSnapshot,
} from './finance-portability-history';
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
    private readonly historicalRates: HistoricalExchangeRateService,
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
    sourceFileName?: string,
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
    const normalized = normalizeFinanceImportDocument(input);
    const document = validateFinanceImportDocument(normalized.input);
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
      historicalRates: this.historicalRates,
      signal,
    });
    const write = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`finance-import:${profileId}`}, 0))`,
        );
        const rollbackSnapshot = await encodeFinanceRollbackSnapshot(
          await financeDataSnapshot(tx, profileId),
        );
        return writeFinanceImport({
          tx,
          profileId,
          document,
          rates,
          fingerprint,
          rollbackSnapshot,
          sourceFileName: sourceFileName?.trim().slice(0, 255) || null,
          initialWarnings: normalized.warnings,
          onProgress,
          signal,
          delivery: this.delivery,
          presentation: this.presentation,
        });
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
    const earliest = write.scheduledAt.sort(
      (left, right) => left.getTime() - right.getTime(),
    )[0];
    if (earliest) this.delivery.notify(earliest);
    return write.result;
  }

  async history(profileId: string): Promise<ConsumerFinancePortabilityHistory> {
    const [imports, exports] = await Promise.all([
      this.prisma.financeDataImportReceipt.findMany({
        where: { profileId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        select: {
          id: true,
          operation: true,
          mode: true,
          sourceFileName: true,
          importedCount: true,
          counts: true,
          createdAt: true,
          rollbackSnapshot: true,
          rolledBackAt: true,
          rollbackOfId: true,
        },
      }),
      this.prisma.financeDataExportReceipt.findMany({
        where: { profileId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
    ]);
    const items: ConsumerFinancePortabilityHistoryItem[] = [
      ...imports.map((item) => ({
        id: item.id,
        operation:
          item.operation === 'ROLLBACK'
            ? ('ROLLBACK' as const)
            : ('IMPORT' as const),
        mode: item.mode === 'REPLACE' ? ('REPLACE' as const) : ('ADD' as const),
        sourceFileName: item.sourceFileName,
        recordCount: item.importedCount,
        counts: item.counts as ConsumerFinanceImportResult['counts'],
        createdAt: item.createdAt.toISOString(),
        canRollback:
          item.rollbackSnapshot !== null && item.rolledBackAt === null,
        rolledBackAt: item.rolledBackAt?.toISOString() ?? null,
        rollbackOfId: item.rollbackOfId,
      })),
      ...exports.map((item) => ({
        id: item.id,
        operation: 'EXPORT' as const,
        mode: null,
        sourceFileName: null,
        recordCount: item.exportedCount,
        counts: item.counts as ConsumerFinanceImportResult['counts'],
        createdAt: item.createdAt.toISOString(),
        canRollback: false,
        rolledBackAt: null,
        rollbackOfId: null,
      })),
    ];
    items.sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    );
    return { items: items.slice(0, 50) };
  }

  async rollback(
    profileId: string,
    importId: string,
  ): Promise<ConsumerFinanceRollbackResult> {
    const source = await this.prisma.financeDataImportReceipt.findFirst({
      where: { id: importId, profileId },
      select: { rollbackSnapshot: true, rolledBackAt: true },
    });
    if (!source) throw new NotFoundException('Finance import not found');
    if (!source.rollbackSnapshot || source.rolledBackAt) {
      throw new ConflictException(
        'This Finance import can no longer be rolled back',
      );
    }
    const snapshot = validateFinanceImportDocument(
      await decodeFinanceRollbackSnapshot(source.rollbackSnapshot),
    );
    const document = { ...snapshot, mode: 'REPLACE' as const };
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: {
        defaultCurrency: true,
        botIntegration: { select: { workspaceId: true } },
      },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    const signal = new AbortController().signal;
    const rates = await prepareFinanceImportRates({
      document,
      workspaceId: profile.botIntegration.workspaceId,
      defaultCurrency:
        document.settings?.defaultCurrency ?? profile.defaultCurrency,
      conversion: this.conversion,
      historicalRates: this.historicalRates,
      signal,
    });
    const fingerprint = financeRequestFingerprint({
      rollbackOf: importId,
      document,
    });
    const write = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`finance-import:${profileId}`}, 0))`,
        );
        const current = await tx.financeDataImportReceipt.findFirst({
          where: { id: importId, profileId },
          select: { rollbackSnapshot: true, rolledBackAt: true },
        });
        if (!current?.rollbackSnapshot || current.rolledBackAt) {
          throw new ConflictException(
            'This Finance import can no longer be rolled back',
          );
        }
        const rollbackSnapshot = await encodeFinanceRollbackSnapshot(
          await financeDataSnapshot(tx, profileId),
        );
        const restored = await writeFinanceImport({
          tx,
          profileId,
          document,
          rates,
          fingerprint,
          rollbackSnapshot,
          operation: 'ROLLBACK',
          rollbackOfId: importId,
          onProgress: () => undefined,
          signal,
          delivery: this.delivery,
          presentation: this.presentation,
        });
        await tx.financeProfile.update({
          where: { id: profileId },
          data: {
            displayName: snapshot.settings?.displayName?.trim() || null,
          },
        });
        await tx.financeDataImportReceipt.update({
          where: { id: importId },
          data: { rolledBackAt: new Date(), rollbackSnapshot: null },
        });
        return restored;
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
    const earliest = write.scheduledAt.sort(
      (left, right) => left.getTime() - right.getTime(),
    )[0];
    if (earliest) this.delivery.notify(earliest);
    return { ...write.result, restoredFromImportId: importId };
  }
}
