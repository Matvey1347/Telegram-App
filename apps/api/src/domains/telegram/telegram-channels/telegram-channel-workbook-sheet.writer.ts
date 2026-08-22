import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

@Injectable()
export class TelegramChannelWorkbookSheetWriter {
  exportValue(value: unknown): string | number | boolean | Date | null {
    if (value == null) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'bigint') return value.toString();
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (
      typeof value === 'object' &&
      'toNumber' in value &&
      typeof (value as { toNumber?: unknown }).toNumber === 'function'
    ) {
      return (value as { toNumber: () => number }).toNumber();
    }
    return JSON.stringify(value);
  }

  dateOnly(value: Date | null | undefined) {
    return value ? value.toISOString().slice(0, 10) : null;
  }

  safeSheetName(value: string) {
    return value.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
  }

  safeFileName(value: string) {
    return (
      value
        .trim()
        .replace(/^@/, '')
        .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'telegram-channel'
    );
  }

  addKeyValueSheet(
    workbook: ExcelJS.Workbook,
    name: string,
    rows: Array<[string, unknown]>,
  ) {
    const sheet = workbook.addWorksheet(this.safeSheetName(name));
    sheet.columns = [
      { header: 'Field', key: 'field', width: 36 },
      { header: 'Value', key: 'value', width: 90 },
    ];
    rows.forEach(([field, value]) =>
      sheet.addRow({ field, value: this.exportValue(value) }),
    );
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return sheet;
  }

  addTableSheet(
    workbook: ExcelJS.Workbook,
    name: string,
    columns: Array<{ header: string; key: string; width?: number }>,
    rows: Array<Record<string, unknown>>,
  ) {
    const sheet = workbook.addWorksheet(this.safeSheetName(name));
    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width || 18,
    }));
    rows.forEach((row) => {
      const normalized: Record<string, unknown> = {};
      for (const column of columns) {
        normalized[column.key] = this.exportValue(row[column.key]);
      }
      sheet.addRow(normalized);
    });
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: Math.max(columns.length, 1) },
    };
    return sheet;
  }

  addPromoImages(
    workbook: ExcelJS.Workbook,
    sheet: ExcelJS.Worksheet,
    promos: Array<{ imageData?: string | null }>,
  ) {
    promos.forEach((promo, index) => {
      const imageData = String(promo.imageData || '');
      const match = imageData.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
      if (!match) return;
      const extension =
        match[1] === 'jpg' ? 'jpeg' : (match[1] as 'png' | 'jpeg');
      try {
        const imageId = workbook.addImage({ base64: imageData, extension });
        const row = index + 2;
        sheet.getRow(row).height = 90;
        sheet.addImage(imageId, {
          tl: { col: 6, row: row - 1 },
          ext: { width: 120, height: 80 },
        });
      } catch {
        // Invalid user-uploaded image data should not break the whole export.
      }
    });
  }
}
