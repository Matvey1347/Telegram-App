import { leadImportReferences } from './lead-source-import';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
import { TelegramLeadExportService } from './lead-export.service';
import { mapLeadSource } from './lead-source-metrics';
import { leadSource } from './lead.spec-fixtures';
function fixture() {
  const rows = Array.from({ length: 1001 }, (_, index) =>
    leadSource({
      id: `source_${index}`,
      title:
        index === 0
          ? '=WEBSERVICE("https://untrusted.test")'
          : `Джерело ${index}`,
    }),
  );
  const prisma = {
      telegramLeadSource: { findMany: jest.fn().mockResolvedValue(rows) },
    },
    policy = {
      access: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
    },
    read = {
      metrics: jest.fn().mockResolvedValue(new Map()),
      mapSource: mapLeadSource,
    };
  return {
    service: new TelegramLeadExportService(
      prisma as unknown as PrismaService,
      policy as unknown as TelegramLeadPolicy,
      read as unknown as TelegramLeadReadService,
    ),
    prisma,
    read,
  };
}
describe('Lead source CSV/XLSX export', () => {
  it('bounds CSV to1000 records and escapes formulas without secrets or contact dumps', async () => {
    const h = fixture(),
      result = await h.service.export('viewer', 'csv'),
      text = Buffer.from(result.contentBase64, 'base64').toString('utf8');
    expect(result).toMatchObject({
      fileName: 'lead-sources.csv',
      truncated: true,
    });
    expect(text).toContain("'=WEBSERVICE");
    expect(text).not.toContain('Джерело 1000');
    expect(text).not.toContain('policy:source');
    expect(h.read.metrics).toHaveBeenCalledTimes(1);
    expect(h.prisma.telegramLeadSource.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace' },
      orderBy: { id: 'asc' },
      take: 1001,
    });
  });
  it('roundtrips a small Telegram CSV export by URL column despite quoted multiline source titles', async () => {
    const h = fixture();
    h.prisma.telegramLeadSource.findMany.mockResolvedValue([
      leadSource({ title: 'A, "quoted"\nsource' }),
    ]);
    const result = await h.service.export('viewer', 'csv');
    expect(
      leadImportReferences(
        Buffer.from(result.contentBase64, 'base64').toString('utf8'),
        'CSV',
      ),
    ).toEqual(['https://t.me/source_channel']);
  });
  it('produces a readable bounded XLSX workbook with plain string cells and honest zero qualified leads', async () => {
    const h = fixture(),
      result = await h.service.export('viewer', 'xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      new Uint8Array(Buffer.from(result.contentBase64, 'base64')).buffer,
    );
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(1001);
    expect(sheet.getCell('A2').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('A2').text.startsWith("'=")).toBe(true);
    expect(sheet.getCell('K2').value).toBe(0);
    expect(result.truncated).toBe(true);
  });
});
