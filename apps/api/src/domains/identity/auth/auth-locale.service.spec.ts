import { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService locale contract', () => {
  it('persists the locale selected on the registration screen', async () => {
    const tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      workspaceMember: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.test',
          name: 'Ольга',
          editorShortcuts: null,
          locale: 'ru',
          authVersion: 0,
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const workspaceService = {
      resolveWorkspaceMembershipForUser: jest.fn().mockResolvedValue({
        role: 'owner',
        roleDefinition: null,
        workspace: {
          id: 'workspace-1',
          name: 'Рабочее пространство Ольга',
          timezone: 'Europe/Warsaw',
          avatarIcon: null,
        },
      }),
    } as any;
    const service = new AuthService(
      prisma,
      { signAsync: jest.fn().mockResolvedValue('token') } as any,
      workspaceService,
    );

    const result = await service.register({
      email: 'user@example.test',
      password: 'password',
      name: 'Ольга',
      locale: 'ru',
    });

    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ locale: 'ru' }),
    });
    expect(tx.$executeRaw.mock.calls[0][0].values).toContain(
      'Рабочее пространство Ольга',
    );
    expect(result.user.locale).toBe('ru');
  });

  it('returns a stable code for invalid credentials', async () => {
    const service = new AuthService(
      { user: { findUnique: jest.fn().mockResolvedValue(null) } } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.login({ email: 'missing@example.test', password: 'password' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AUTH_INVALID_CREDENTIALS' }),
    });
  });

  it('returns a stable code when registration email already exists', async () => {
    const service = new AuthService(
      {
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.register({
        email: 'used@example.test',
        password: 'password',
        name: 'User',
        locale: 'ru',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AUTH_EMAIL_ALREADY_EXISTS' }),
    });
  });

  it('returns the duplicate-email code when concurrent registration loses the unique race', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
    const service = new AuthService(
      {
        user: { findUnique: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn().mockRejectedValue(conflict),
      } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.register({
        email: 'racing@example.test',
        password: 'password',
        name: 'User',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'AUTH_EMAIL_ALREADY_EXISTS' }),
    });
  });

  it('includes the persisted normalized locale in /auth/me data', async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          name: 'User',
          editorShortcuts: null,
          locale: 'ru-RU',
          authVersion: 0,
        }),
      },
    } as any;
    const workspaceService = {
      resolveWorkspaceMembershipForUser: jest.fn().mockResolvedValue({
        role: 'owner',
        roleDefinition: null,
        workspace: {
          id: 'workspace-1',
          name: 'Workspace',
          timezone: 'Europe/Warsaw',
          avatarIcon: null,
        },
      }),
    } as any;
    const service = new AuthService(
      prisma,
      { signAsync: jest.fn().mockResolvedValue('token') } as any,
      workspaceService,
    );

    await expect(service.me('user-1')).resolves.toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ locale: 'ru' }),
      }),
    );
  });

  it('falls back to English for a legacy unsupported locale', async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          name: 'User',
          editorShortcuts: null,
          locale: 'unknown',
          authVersion: 0,
        }),
      },
    } as any;
    const workspaceService = {
      resolveWorkspaceMembershipForUser: jest.fn().mockResolvedValue({
        role: 'owner',
        roleDefinition: null,
        workspace: {
          id: 'workspace-1',
          name: 'Workspace',
          timezone: 'UTC',
          avatarIcon: null,
        },
      }),
    } as any;
    const service = new AuthService(
      prisma,
      { signAsync: jest.fn().mockResolvedValue('token') } as any,
      workspaceService,
    );

    const result = await service.me('user-1');
    expect(result.user.locale).toBe('en');
  });
});
