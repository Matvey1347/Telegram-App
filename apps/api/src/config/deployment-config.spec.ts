import {
  apiPort,
  publicApiOrigin,
  publicWebOrigin,
  trustedProxyHops,
} from './deployment-config';

describe('deployment config', () => {
  it('uses FRONTEND_URL as the single public web origin', () => {
    expect(publicWebOrigin({ FRONTEND_URL: ' https://web.example/ ' })).toBe(
      'https://web.example',
    );
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

  it('never exposes a development tunnel as the production web origin', () => {
    expect(
      publicWebOrigin({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://stale.ngrok-free.app/finance/old',
      }),
    ).toBe(undefined);
    expect(
      publicWebOrigin({
        NODE_ENV: 'development',
        FRONTEND_URL: 'https://active.trycloudflare.com',
      }),
    ).toBe('https://active.trycloudflare.com');
    expect(
      publicWebOrigin({
        TELEGRAM_BOT_RUNTIME_ENVIRONMENT: 'PRODUCTION',
        FRONTEND_URL: 'https://stale.ngrok-free.app',
      }),
    ).toBe(undefined);
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

  it('trusts one ingress hop in production and no proxy in local development', () => {
    expect(trustedProxyHops({ NODE_ENV: 'production' })).toBe(1);
    expect(trustedProxyHops({ NODE_ENV: 'development' })).toBe(0);
    expect(
      trustedProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '2' }),
    ).toBe(2);
    expect(
      trustedProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '99' }),
    ).toBe(1);
  });
});
