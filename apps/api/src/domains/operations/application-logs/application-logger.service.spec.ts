import {
  ApplicationLoggerService,
  applicationLogMinimumLevel,
} from './application-logger.service';

describe('ApplicationLoggerService production defaults', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMinimumLevel = process.env.APP_LOG_MIN_LEVEL;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalMinimumLevel === undefined) {
      delete process.env.APP_LOG_MIN_LEVEL;
    } else {
      process.env.APP_LOG_MIN_LEVEL = originalMinimumLevel;
    }
  });

  function setup() {
    const writer = { enqueue: jest.fn() };
    const requestContext = { get: jest.fn().mockReturnValue(null) };
    const logger = new ApplicationLoggerService(
      writer as never,
      requestContext as never,
    );
    return { logger, writer };
  }

  it('defaults persisted production logs to warn', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APP_LOG_MIN_LEVEL;
    const { logger, writer } = setup();

    logger.writeStructured({ event: 'ordinary_info', message: 'ok' });
    logger.writeStructured({
      level: 'warn',
      event: 'real_warning',
      message: 'needs attention',
    });

    expect(applicationLogMinimumLevel()).toBe('warn');
    expect(writer.enqueue).toHaveBeenCalledTimes(1);
    expect(writer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', event: 'real_warning' }),
    );
  });

  it('honors an explicit environment override', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_LOG_MIN_LEVEL = 'info';
    const { logger, writer } = setup();

    logger.writeStructured({ event: 'diagnostic_info', message: 'enabled' });

    expect(applicationLogMinimumLevel()).toBe('info');
    expect(writer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'info', event: 'diagnostic_info' }),
    );
  });

  it('keeps the development default at info', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.APP_LOG_MIN_LEVEL;

    expect(applicationLogMinimumLevel()).toBe('info');
  });

  it('uses the cost-safe default when NODE_ENV is omitted', () => {
    delete process.env.NODE_ENV;
    delete process.env.APP_LOG_MIN_LEVEL;

    expect(applicationLogMinimumLevel()).toBe('warn');
  });
});
