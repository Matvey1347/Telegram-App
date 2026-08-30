import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const config = { get: jest.fn().mockReturnValue('test-secret') };
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(
      config as unknown as ConfigService,
      prisma as never,
    );
  });

  it('accepts the current auth version', async () => {
    prisma.user.findUnique.mockResolvedValue({ authVersion: 2 });
    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@example.test', ver: 2 }),
    ).resolves.toEqual({ sub: 'user-1', email: 'a@example.test', ver: 2 });
  });

  it('rejects a JWT issued before password reset', async () => {
    prisma.user.findUnique.mockResolvedValue({ authVersion: 3 });
    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@example.test', ver: 2 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a legacy JWT only while the account remains at version zero', async () => {
    prisma.user.findUnique.mockResolvedValue({ authVersion: 0 });
    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@example.test' }),
    ).resolves.toEqual({ sub: 'user-1', email: 'a@example.test' });

    prisma.user.findUnique.mockResolvedValue({ authVersion: 1 });
    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@example.test' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
