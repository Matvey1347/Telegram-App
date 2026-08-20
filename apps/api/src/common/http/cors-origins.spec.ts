import { corsOrigins } from './cors-origins';

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
});
