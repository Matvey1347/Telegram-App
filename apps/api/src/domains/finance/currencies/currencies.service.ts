import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type CurrencyDisplayMode } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { UpdateCurrencySettingsDto } from './dto';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { financeAuthorizationTestFallback } from '../finance-authorization-test-fallback';

const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'PLN',
  'UAH',
  'GBP',
  'TRY',
  'CAD',
  'AUD',
  'CHF',
  'CZK',
  'DKK',
  'NOK',
  'SEK',
  'JPY',
  'CNY',
  'RON',
  'HUF',
  'BGN',
  'GEL',
  'KZT',
] as const;

// One observation per UTC day/pair bounds automatic history growth to
// tracked currencies × days, regardless of workspace count. Keep history while dated Finance
// writes depend on it; any future retention job must first protect the oldest
// supported transaction-entry date and immutable valuation snapshots.
const utcRateDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

const getSupportedCurrencies = () => {
  const intl = Intl as unknown as {
    supportedValuesOf?: (key: 'currency') => string[];
  };
  const intlCurrencies = intl.supportedValuesOf?.('currency') ?? [];
  return Array.from(
    new Set([...SUPPORTED_CURRENCIES, ...intlCurrencies]),
  ).sort();
};

type WorkspaceCurrencySettingsRow = {
  primaryCurrency: string;
  secondaryCurrency: string;
  tertiaryCurrency: string;
  currencyDisplayMode: CurrencyDisplayMode;
};

@Injectable()
export class CurrenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly authorization: WorkspaceAuthorizationService = financeAuthorizationTestFallback(workspaceService),
  ) {}

  async getSettings(userId: string) {
    const { workspaceId } = await this.authorization.require(userId, 'finance.view');
    const [workspace] = await this.prisma.$queryRaw<
      WorkspaceCurrencySettingsRow[]
    >`
      SELECT
        "primaryCurrency",
        "secondaryCurrency",
        "tertiaryCurrency",
        "currencyDisplayMode"
      FROM "Workspace"
      WHERE id = ${workspaceId}
      LIMIT 1
    `;
    if (!workspace) throw new NotFoundException('Workspace not found');
    return {
      ...workspace,
      supportedCurrencies: getSupportedCurrencies(),
    };
  }

  async updateSettings(userId: string, dto: UpdateCurrencySettingsDto) {
    const access = await this.authorization.require(userId, 'finance.manageCurrencies');
    if (dto.primaryCurrency === dto.secondaryCurrency) {
      throw new BadRequestException(
        'Primary and secondary currencies must be different',
      );
    }
    const workspaceId = access.workspaceId;
    const [workspace] = await this.prisma.$queryRaw<
      WorkspaceCurrencySettingsRow[]
    >`
      UPDATE "Workspace"
      SET
        "primaryCurrency" = ${dto.primaryCurrency},
        "secondaryCurrency" = ${dto.secondaryCurrency},
        "tertiaryCurrency" = ${dto.tertiaryCurrency ?? 'UAH'},
        "currencyDisplayMode" = ${dto.currencyDisplayMode}::"CurrencyDisplayMode",
        "updatedAt" = NOW()
      WHERE id = ${workspaceId}
      RETURNING
        "primaryCurrency",
        "secondaryCurrency",
        "tertiaryCurrency",
        "currencyDisplayMode"
    `;
    if (!workspace) throw new NotFoundException('Workspace not found');

    return {
      ...workspace,
      supportedCurrencies: getSupportedCurrencies(),
    };
  }

  async getLatestRates(userId: string) {
    await this.authorization.require(userId, 'finance.view');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT DISTINCT ON (rate."baseCurrency", rate."targetCurrency")
        rate.*
      FROM "ExchangeRate" AS rate
      WHERE rate."date" <= NOW()
      ORDER BY
        rate."baseCurrency" ASC,
        rate."targetCurrency" ASC,
        rate."date" DESC,
        rate."id" DESC
    `);
  }

  async getRates(userId: string) {
    await this.authorization.require(userId, 'finance.view');
    return this.prisma.exchangeRate.findMany({ orderBy: { date: 'desc' } });
  }

  async syncSystemRates() {
    const response = await fetch(
      'https://open.er-api.com/v6/latest/EUR',
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = (await response.json()) as {
      result?: string;
      rates?: Record<string, number>;
      error_type?: string;
    };

    if (payload.result !== 'success' || !payload.rates) {
      throw new Error(payload.error_type || 'invalid_api_response');
    }

    const now = utcRateDay(new Date());
    const rows = getSupportedCurrencies()
      .filter((currency) => currency !== 'EUR')
      .map((targetCurrency) => ({
        baseCurrency: 'EUR',
        targetCurrency,
        rate: payload.rates?.[targetCurrency],
        date: now,
        source: 'open.er-api.com',
      }))
      .filter((row) => row.rate && row.rate > 0) as Array<{
      baseCurrency: string;
      targetCurrency: string;
      rate: number;
      date: Date;
      source: string;
    }>;

    if (!rows.length) return 0;

    // The schema unique key plus a UTC-day timestamp makes retries and repeated
    // same-day syncs idempotent without discarding historical observations.
    await this.prisma.exchangeRate.createMany({
      data: rows,
      skipDuplicates: true,
    });

    return rows.length;
  }

}
