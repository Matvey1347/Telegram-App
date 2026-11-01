import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { LeadExport } from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
export function leadSpreadsheetText(value: unknown): string {
  const text = ['string', 'number', 'boolean'].includes(typeof value)
    ? String(value)
    : '';
  const first = Array.from(text).find(
    (character) => !/[\s\p{C}]/u.test(character),
  );
  return first && ['=', '+', '@', '-'].includes(first) ? `'${text}` : text;
}
export function leadCsvCell(value: unknown) {
  return `"${leadSpreadsheetText(value).replace(/"/g, '""')}"`;
}
@Injectable()
export class TelegramLeadExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TelegramLeadPolicy,
    private readonly read: TelegramLeadReadService,
  ) {}
  async export(userId: string, format: 'csv' | 'xlsx'): Promise<LeadExport> {
    if (!['csv', 'xlsx'].includes(format))
      throw new BadRequestException('LEAD_EXPORT_FORMAT_INVALID');
    const { workspaceId } = await this.policy.access(userId);
    const rows = await this.prisma.telegramLeadSource.findMany({
      where: { workspaceId },
      orderBy: { id: 'asc' },
      take: 1001,
    });
    const sources = rows.slice(0, 1000),
      metrics = await this.read.metrics(
        workspaceId,
        sources.map((source) => source.id),
      );
    const header = [
      'Source',
      'Reference',
      'URL',
      'Status',
      'Coverage',
      'Observed posts',
      'Advertisements (payment unverified)',
      'Candidates',
      'Confirmed contacts',
      'Human-confirmed leads',
      'Qualified leads (reserved)',
      'Rejected candidates',
      'Rejected materials',
    ];
    const values = sources.map((source) => {
      const view = this.read.mapSource(source, metrics.get(source.id));
      return [
        view.title,
        source.type === 'MANUAL_IMPORT'
          ? source.normalizedKey.replace(/^manual:/, '')
          : source.username
            ? `@${source.username}`
            : (source.channelId ?? source.normalizedKey),
        view.url,
        view.status,
        view.coverageState,
        view.metrics.observedPosts,
        view.metrics.advertisements,
        view.metrics.uniqueCandidates,
        view.metrics.confirmedContacts,
        view.metrics.confirmedLeads,
        0,
        view.metrics.rejectedCandidates,
        view.metrics.rejectedMaterials,
      ];
    });
    let content: Buffer, mimeType: string;
    if (format === 'csv') {
      content = Buffer.from(
        '\ufeff' +
          [header, ...values]
            .map((row) => row.map(leadCsvCell).join(','))
            .join('\r\n'),
        'utf8',
      );
      mimeType = 'text/csv; charset=utf-8';
    } else {
      const workbook = new ExcelJS.Workbook(),
        sheet = workbook.addWorksheet('Lead sources');
      sheet.addRow(header);
      for (const row of values)
        sheet.addRow(
          row.map((value) =>
            typeof value === 'number' ? value : leadSpreadsheetText(value),
          ),
        );
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((column) => {
        column.width = 24;
      });
      content = Buffer.from(await workbook.xlsx.writeBuffer());
      mimeType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    return {
      fileName: `lead-sources.${format}`,
      mimeType,
      contentBase64: content.toString('base64'),
      truncated: rows.length > 1000,
    };
  }
}
