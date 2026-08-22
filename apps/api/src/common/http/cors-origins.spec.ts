import { corsOrigins, webCorsOrigins } from './cors-origins';

describe('corsOrigins', () => {
  it('allows explicitly configured HTTP(S) origins after normalizing paths', () => {
    expect(
      corsOrigins(
        'http://localhost:3000/',
        'https://finance.example.test/finance/bot-1',
        'https://finance.example.test',
      ),
    ).toEqual(['http://localhost:3000', 'https://finance.example.test']);
  });

  it('does not introduce a wildcard for invalid or unsupported values', () => {
    expect(corsOrigins('*', 'ftp://example.test', undefined)).toEqual([]);
  });

  it('allows equivalent www and non-www web origins', () => {
    expect(webCorsOrigins('https://nexeloq.com')).toEqual([
      'https://nexeloq.com',
      'https://www.nexeloq.com',
    ]);
    expect(webCorsOrigins('https://www.nexeloq.com')).toEqual([
      'https://www.nexeloq.com',
      'https://nexeloq.com',
    ]);
  });

  it('does not create a www alias for local development origins', () => {
    expect(webCorsOrigins('http://localhost:3000')).toEqual([
      'http://localhost:3000',
    ]);
  });
});
