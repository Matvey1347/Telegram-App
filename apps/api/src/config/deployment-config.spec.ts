import {
  apiPort,
  publicApiOrigin,
  publicWebOrigin,
} from './deployment-config';

describe('deployment config', () => {
  it('uses FRONTEND_URL as the single public web origin', () => {
    expect(
      publicWebOrigin({ FRONTEND_URL: ' https://web.example/ ' }),
    ).toBe('https://web.example');
  });

  it('normalizes configured URLs to HTTP origins and rejects invalid protocols', () => {
    expect(
      publicWebOrigin({ FRONTEND_URL: 'https://web.example/product/path' }),
    ).toBe('https://web.example');
    expect(publicWebOrigin({ FRONTEND_URL: 'javascript:alert(1)' })).toBe(
      undefined,
    );
    expect(publicWebOrigin({ FRONTEND_URL: 'not-a-url' })).toBe(undefined);
  });

  it('uses canonical API_PUBLIC_URL for public API callbacks', () => {
    expect(publicApiOrigin({ API_PUBLIC_URL: 'https://api.example/' })).toBe(
      'https://api.example',
    );
  });

  it('resolves the deployment port without a product-specific setting', () => {
    expect(apiPort({ PORT: '8080', API_PORT: '4000' })).toBe(8080);
    expect(apiPort({ API_PORT: '4100' })).toBe(4100);
    expect(apiPort({})).toBe(4000);
  });
});
