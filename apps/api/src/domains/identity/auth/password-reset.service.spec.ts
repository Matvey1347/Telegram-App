import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    passwordResetToken: { upsert: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const email = { send: jest.fn() };
  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PasswordResetService(prisma as never, email as never);
  });

  it('stores only a hashed expiring token and sends the raw token by email', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'person@example.test',
      locale: 'ru',
    });
    prisma.passwordResetToken.upsert.mockResolvedValue({});
    email.send.mockResolvedValue(undefined);

    const result = await service.request(' Person@Example.Test ');

    expect(result).toEqual({
      message:
        'If an account exists for that email, a reset link has been sent.',
    });
    const sentToken = email.send.mock.calls[0][1] as string;
    expect(email.send).toHaveBeenCalledWith(
      'person@example.test',
      sentToken,
      'ru',
    );
    expect(sentToken).toHaveLength(43);
    const write = prisma.passwordResetToken.upsert.mock.calls[0][0];
    expect(write.where).toEqual({ userId: 'user-1' });
    expect(write.create.tokenHash).not.toBe(sentToken);
    expect(write.create.tokenHash).toHaveLength(64);
    expect(write.create.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(JSON.stringify(write)).not.toContain(sentToken);
  });

  it('returns the same response and performs no write for an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.request('missing@example.test');

    expect(result).toEqual({
      message:
        'If an account exists for that email, a reset link has been sent.',
    });
    expect(prisma.passwordResetToken.upsert).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('does not expose an email delivery failure in the response', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'person@example.test',
      locale: 'en',
    });
    prisma.passwordResetToken.upsert.mockResolvedValue({});
    email.send.mockRejectedValue(new Error('SMTP unavailable'));

    await expect(service.request('person@example.test')).resolves.toEqual({
      message:
        'If an account exists for that email, a reset link has been sent.',
    });
  });

  it('atomically claims a valid token and changes the password', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const tx = {
      passwordResetToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(
      service.reset('a'.repeat(43), 'new-password'),
    ).resolves.toEqual({
      message: 'Password has been reset.',
    });
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'reset-1',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
    const passwordHash = tx.user.update.mock.calls[0][0].data.passwordHash;
    expect(tx.user.update.mock.calls[0][0].data.authVersion).toEqual({
      increment: 1,
    });
    await expect(bcrypt.compare('new-password', passwordHash)).resolves.toBe(
      true,
    );
  });

  it.each([
    ['unknown token', null],
    [
      'expired token',
      { id: 'reset-1', userId: 'user-1', usedAt: null, expiresAt: new Date(0) },
    ],
    [
      'already-used token',
      {
        id: 'reset-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ],
  ])('rejects an %s without changing a password', async (_label, token) => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(token);
    const tx = {
      passwordResetToken: {
        updateMany: jest.fn(),
      },
      user: { update: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(
      service.reset('b'.repeat(43), 'new-password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reset('b'.repeat(43), 'new-password'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AUTH_RESET_TOKEN_INVALID' }),
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a concurrent replay after hashing without changing the password', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const tx = {
      passwordResetToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: { update: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(
      service.reset('c'.repeat(43), 'new-password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
