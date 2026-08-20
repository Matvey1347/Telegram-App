import { AppController } from './app.controller';

describe('AppController health check', () => {
  it('returns process health without Prisma or another injected dependency', () => {
    const response = new AppController().health();

    expect(response).toMatchObject({
      status: 'ok',
      service: 'telegram-system-api',
    });
    expect(new Date(response.timestamp).toString()).not.toBe('Invalid Date');
  });
});
