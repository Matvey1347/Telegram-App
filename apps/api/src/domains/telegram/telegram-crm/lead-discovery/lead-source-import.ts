import { BadRequestException } from '@nestjs/common';
/** Bounded CSV/text parser. Quoted titles may contain separators, escaped quotes or newlines. */
export function leadImportReferences(
  text: string,
  format: 'TEXT' | 'CSV',
): string[] {
  if (Buffer.byteLength(text) > 65536)
    throw new BadRequestException('LEAD_IMPORT_TOO_LARGE');
  let references: string[];
  if (format === 'TEXT')
    references = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  else if (format === 'CSV') {
    const rows: string[][] = [];
    let row: string[] = [],
      field = '',
      quoted = false;
    for (let index = 0; index <= text.length; index++) {
      const character = text[index] ?? '\n';
      if (character === '"') {
        if (quoted && text[index + 1] === '"') {
          field += '"';
          index++;
        } else quoted = !quoted;
      } else if (!quoted && (character === ',' || character === ';')) {
        row.push(field.trim());
        field = '';
      } else if (!quoted && (character === '\n' || character === '\r')) {
        if (character === '\r' && text[index + 1] === '\n') index++;
        row.push(field.trim());
        if (row.some((value) => value.length)) rows.push(row);
        row = [];
        field = '';
        if (rows.length > 101)
          throw new BadRequestException('LEAD_IMPORT_LIMIT');
      } else field += character;
    }
    if (quoted) throw new BadRequestException('LEAD_CSV_INVALID');
    const header = rows[0]?.map((value) => value.trim().toLowerCase()) ?? [];
    const indexes = ['url', 'reference', 'username', 'channel']
      .map((name) => header.indexOf(name))
      .filter((index) => index >= 0);
    if (indexes.length) {
      rows.shift();
      references = rows
        .map(
          (values) =>
            indexes.map((index) => values[index] ?? '').find(Boolean) ?? '',
        )
        .filter(Boolean);
    } else {
      if (header.length === 1 && header[0] === 'source') rows.shift();
      references = rows.map((values) => values[0] ?? '').filter(Boolean);
    }
  } else throw new BadRequestException('LEAD_IMPORT_FORMAT_INVALID');
  if (references.length > 100)
    throw new BadRequestException('LEAD_IMPORT_LIMIT');
  return references;
}
