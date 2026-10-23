import { ApplicationLogsExceptionFilter } from './application-logs-exception.filter';

describe('ApplicationLogsExceptionFilter', () => {
  it('reports oversized request bodies as 413 instead of hiding them as 500', () => {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const logger = { writeStructured: jest.fn() };
    const requestContext = { get: jest.fn().mockReturnValue(undefined) };
    const filter = new ApplicationLogsExceptionFilter(
      logger as never,
      requestContext as never,
    );
    const request = {
      method: 'POST',
      originalUrl: '/api/telegram-channels/channel-1/unified-import/preview',
      route: { path: '/telegram-channels/:channelId/unified-import/preview' },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    };
    const error = Object.assign(new Error('request entity too large'), {
      name: 'PayloadTooLargeError',
      status: 413,
      type: 'entity.too.large',
    });

    filter.catch(error, host as never);

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'Request body exceeds the configured size limit.',
      code: 'PAYLOAD_TOO_LARGE',
      correlationId: null,
    });
    expect(logger.writeStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 413,
        errorCode: 'PAYLOAD_TOO_LARGE',
      }),
    );
  });
});
