import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { ResponseCacheInterceptor } from './response-cache.interceptor';
import { ResponseCacheService } from './response-cache.service';

describe('ResponseCacheInterceptor', () => {
  const httpContext = (request: {
    method: string;
    originalUrl: string;
    headers: Record<string, string | undefined>;
    user?: { sub?: string };
  }): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as ExecutionContext;

  it('caches GET telegram channel responses', async () => {
    const getOrSet = jest.fn(
      (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
    );
    const cache = {
      getOrSet,
      clearByPrefix: jest.fn(),
    } as unknown as ResponseCacheService;
    const interceptor = new ResponseCacheInterceptor(cache);

    const result = await lastValueFrom(
      interceptor.intercept(
        httpContext({
          method: 'GET',
          originalUrl: '/telegram-channels/cm123',
          headers: { 'x-workspace-id': 'ws-1' },
          user: { sub: 'user-1' },
        }),
        { handle: () => of({ ok: true }) } as CallHandler,
      ),
    );

    expect(result).toEqual({ ok: true });
    expect(getOrSet).toHaveBeenCalledTimes(1);
    expect(getOrSet.mock.calls[0][0]).toBe(
      'api:user-1:ws-1:GET:/telegram-channels/cm123',
    );
  });

  it('uses the short server cache for paginated CRM contact lists', async () => {
    const getOrSet = jest.fn(
      (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
    );
    const cache = {
      getOrSet,
      clearByPrefix: jest.fn(),
    } as unknown as ResponseCacheService;
    const interceptor = new ResponseCacheInterceptor(cache);

    await lastValueFrom(
      interceptor.intercept(
        httpContext({
          method: 'GET',
          originalUrl:
            '/telegram-crm/contacts?page=1&pageSize=12&stage=CUSTOMER',
          headers: { 'x-workspace-id': 'ws-1' },
          user: { sub: 'user-1' },
        }),
        { handle: () => of({ items: [] }) } as CallHandler,
      ),
    );

    expect(getOrSet).toHaveBeenCalledWith(
      'api:user-1:ws-1:GET:/telegram-crm/contacts?page=1&pageSize=12&stage=CUSTOMER',
      30_000,
      expect.any(Function),
    );
  });

  it.each([
    '/telegram-crm/conversations/conversation-1/messages?pageSize=50',
    '/api/telegram-crm/conversations/conversation-1/messages?pageSize=50',
    '/telegram-crm/conversations?contactId=contact-1',
    '/telegram-crm/unread',
    '/operations/notifications?limit=20',
    '/operations/notifications/unread-count',
    '/api/operations/notifications/unread-count',
  ])('never caches realtime data at %s', async (originalUrl) => {
    const getOrSet = jest.fn();
    const interceptor = new ResponseCacheInterceptor({
      getOrSet,
      clearByPrefix: jest.fn(),
    } as unknown as ResponseCacheService);

    await expect(
      lastValueFrom(
        interceptor.intercept(
          httpContext({
            method: 'GET',
            originalUrl,
            headers: { 'x-workspace-id': 'ws-1' },
            user: { sub: 'user-1' },
          }),
          { handle: () => of({ ok: true }) } as CallHandler,
        ),
      ),
    ).resolves.toEqual({ ok: true });
    expect(getOrSet).not.toHaveBeenCalled();
  });

  it('invalidates cache only after a successful mutation response', async () => {
    const clearByPrefix = jest.fn();
    const cache = {
      getOrSet: jest.fn(),
      clearByPrefix,
    } as unknown as ResponseCacheService;
    const interceptor = new ResponseCacheInterceptor(cache);

    const response$ = interceptor.intercept(
      httpContext({
        method: 'POST',
        originalUrl: '/telegram-channels/cm123/sync-now',
        headers: { 'x-workspace-id': 'ws-1' },
        user: { sub: 'user-1' },
      }),
      { handle: () => of({ status: 'success' }) } as CallHandler,
    );

    expect(clearByPrefix).not.toHaveBeenCalled();

    const result = await lastValueFrom(response$);

    expect(result).toEqual({ status: 'success' });
    expect(clearByPrefix).toHaveBeenNthCalledWith(1, 'api:user-1:ws-1');
    expect(clearByPrefix).toHaveBeenNthCalledWith(2, 'api:user-1:no-workspace');
  });
});
