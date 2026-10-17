/** Reads the currently available prefix of one JSON string field. */
export function partialJsonStringField(
  source: string,
  field: string,
): string | null {
  const fieldToken = JSON.stringify(field);
  const fieldIndex = source.indexOf(fieldToken);
  if (fieldIndex < 0) return null;

  let index = fieldIndex + fieldToken.length;
  while (/\s/.test(source[index] || '')) index += 1;
  if (source[index] !== ':') return null;
  index += 1;
  while (/\s/.test(source[index] || '')) index += 1;
  if (source[index] !== '"') return null;
  index += 1;

  let result = '';
  while (index < source.length) {
    const character = source[index];
    if (character === '"') return withoutDanglingSurrogate(result);
    if (character !== '\\') {
      result += character;
      index += 1;
      continue;
    }

    const escape = source[index + 1];
    if (!escape) return withoutDanglingSurrogate(result);
    if (escape === 'u') {
      const hex = source.slice(index + 2, index + 6);
      if (hex.length < 4 || !/^[0-9a-f]{4}$/i.test(hex)) {
        return withoutDanglingSurrogate(result);
      }
      result += String.fromCharCode(Number.parseInt(hex, 16));
      index += 6;
      continue;
    }
    const escapedCharacters: Record<string, string> = {
      '"': '"',
      '\\': '\\',
      '/': '/',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
    };
    if (!(escape in escapedCharacters)) {
      return withoutDanglingSurrogate(result);
    }
    result += escapedCharacters[escape];
    index += 2;
  }
  return withoutDanglingSurrogate(result);
}

function withoutDanglingSurrogate(value: string) {
  const last = value.charCodeAt(value.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? value.slice(0, -1) : value;
}
