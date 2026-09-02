import { OperationsWebPushConfigService } from './operations-web-push-config.service';

const config = (values: Record<string, string>) => ({
  get: (key: string) => values[key],
});

describe('OperationsWebPushConfigService', () => {
  it('disables Web Push only when the complete tuple is blank', () => {
    const service = new OperationsWebPushConfigService(config({}) as never);
    expect(service.publicConfig()).toEqual({ enabled: false, publicKey: null });
  });

  it('rejects a partial VAPID tuple', () => {
    expect(
      () =>
        new OperationsWebPushConfigService(
          config({ WEB_PUSH_VAPID_SUBJECT: 'mailto:ops@example.com' }) as never,
        ),
    ).toThrow('must be atomic');
  });

  it('accepts a complete validated tuple atomically', () => {
    const service = new OperationsWebPushConfigService(
      config({
        WEB_PUSH_VAPID_SUBJECT: 'mailto:ops@example.com',
        WEB_PUSH_VAPID_PUBLIC_KEY: 'A'.repeat(64),
        WEB_PUSH_VAPID_PRIVATE_KEY: 'B'.repeat(32),
      }) as never,
    );
    expect(service.publicConfig()).toEqual({
      enabled: true,
      publicKey: 'A'.repeat(64),
    });
  });
});
