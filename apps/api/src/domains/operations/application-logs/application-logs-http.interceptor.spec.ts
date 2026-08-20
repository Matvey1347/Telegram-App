import { of } from 'rxjs';
import { ApplicationLogsHttpInterceptor } from './application-logs-http.interceptor';

describe('ApplicationLogsHttpInterceptor', () => {
  const originalSuccessEnabled = process.env.APP_LOG_HTTP_SUCCESS_ENABLED;

  afterEach(() => {
    if (originalSuccessEnabled === undefined) {
      delete process.env.APP_LOG_HTTP_SUCCESS_ENABLED;
    } else {
      process.env.APP_LOG_HTTP_SUCCESS_ENABLED = originalSuccessEnabled;
    }
  });

  function intercept(statusCode: number, path = '/api/channels') {
    const logger = { writeStructured: jest.fn() };
    const requestContext = { get: jest.fn(() => ({ startedAt: Date.now() })) };
    const interceptor = new ApplicationLogsHttpInterceptor(
      logger as never,
      requestContext as never,
    );
    const request = {
      method: 'GET',
      originalUrl: path,
      url: path,
      query: {},
      route: { path: '/channels' },
    };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ statusCode }),
      }),
    };
    interceptor
      .intercept(context as never, { handle: () => of({}) } as never)
      .subscribe();
    return logger;
  }

  it('does not persist ordinary successful request completions by default', () => {
    delete process.env.APP_LOG_HTTP_SUCCESS_ENABLED;
    expect(intercept(200).writeStructured).not.toHaveBeenCalled();
  });

  it('persists failed request completions', () => {
    const logger = intercept(500);
    expect(logger.writeStructured).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', statusCode: 500 }),
    );
  });

  it('allows successful completion persistence during a temporary investigation', () => {
    process.env.APP_LOG_HTTP_SUCCESS_ENABLED = 'true';
    expect(intercept(200).writeStructured).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'info', statusCode: 200 }),
    );
  });

  it('never persists Railway health checks even when success logging is enabled', () => {
    process.env.APP_LOG_HTTP_SUCCESS_ENABLED = 'true';

    expect(
      intercept(200, '/api/health').writeStructured,
    ).not.toHaveBeenCalled();
  });
});
