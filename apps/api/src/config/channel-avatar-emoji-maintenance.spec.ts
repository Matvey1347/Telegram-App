import { config } from 'dotenv';
import {
  avatarEmojiMaintenanceEnvironment,
  parseAvatarEmojiMaintenanceOptions,
} from './channel-avatar-emoji-maintenance';

jest.mock('dotenv', () => ({ config: jest.fn() }));

const options = (args: string[] = []) =>
  parseAvatarEmojiMaintenanceOptions([
    '--workspace=business-workspace',
    ...args,
  ]);

describe('avatar maintenance admission', () => {
  it('requires an exact workspace and defaults to read-only migration', () => {
    expect(options()).toEqual({
      workspaceId: 'business-workspace',
      mode: 'migrate',
      limit: 100,
      execute: false,
      production: false,
    });
    for (const args of [
      [],
      ['--workspace='],
      ['--workspace=*'],
      ['--workspace=business workspace'],
      ['--all'],
    ]) {
      expect(() => parseAvatarEmojiMaintenanceOptions(args)).toThrow();
    }
  });

  it('accepts explicit bounded backfill execution and rejects contradictory flags', () => {
    expect(
      options(['--mode=backfill', '--execute', '--production', '--limit=250']),
    ).toMatchObject({
      mode: 'backfill',
      execute: true,
      production: true,
      limit: 250,
    });
    for (const args of [
      ['--execute', '--dry-run'],
      ['--mode=unknown'],
      ['--limit=0'],
      ['--limit=-1'],
      ['--limit=1001'],
      ['--limit=2.5'],
      ['--unexpected'],
      ['--mode=smoke', '--production'],
    ])
      expect(() => options(args)).toThrow();
  });

  it('selects LOCAL explicitly and never starts runtime infrastructure', () => {
    const environment = {
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'LOCAL',
      DATABASE_URL: 'local-database-input',
    };
    expect(avatarEmojiMaintenanceEnvironment(options(), environment)).toEqual(
      environment,
    );
    expect(config).toHaveBeenCalledWith({ path: '../../.env', quiet: true });
    expect(() => avatarEmojiMaintenanceEnvironment(options(), {})).toThrow(
      'LOCAL',
    );
    expect(() =>
      avatarEmojiMaintenanceEnvironment(options(), {
        TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'PRODUCTION',
      }),
    ).toThrow('LOCAL');
  });

  it('allows read-only production inventory locally without changing System Bot credentials', () => {
    const environment = {
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'LOCAL',
      DATABASE_URL: 'local-database-input',
      DATABASE_URL_PRODUCTION: 'production-database-input',
    };
    const result = avatarEmojiMaintenanceEnvironment(
      options(['--production', '--dry-run']),
      environment,
    );
    expect(result).toMatchObject({
      DATABASE_URL: 'production-database-input',
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'PRODUCTION',
    });
    expect(environment.TELEGRAM_SYSTEM_BOT_ENVIRONMENT).toBe('LOCAL');
  });

  it('refuses production writes without the PRODUCTION System Bot selection', () => {
    expect(() =>
      avatarEmojiMaintenanceEnvironment(
        options(['--production', '--execute']),
        {
          DATABASE_URL_PRODUCTION: 'production-database-input',
          TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'LOCAL',
        },
      ),
    ).toThrow('PRODUCTION');
    expect(() =>
      avatarEmojiMaintenanceEnvironment(options(['--production']), {}),
    ).toThrow('DATABASE_URL_PRODUCTION');
  });

  it('permits immutable-byte migration locally but fresh production MTProto only on production host', () => {
    const environment = {
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'PRODUCTION',
      DATABASE_URL_PRODUCTION: 'production-database-input',
    };
    expect(
      avatarEmojiMaintenanceEnvironment(
        options(['--production', '--execute', '--mode=migrate']),
        { ...environment },
      ),
    ).toMatchObject({ DATABASE_URL: 'production-database-input' });
    expect(() =>
      avatarEmojiMaintenanceEnvironment(
        options(['--production', '--execute', '--mode=backfill']),
        { ...environment },
      ),
    ).toThrow('production host');
    expect(
      avatarEmojiMaintenanceEnvironment(
        options(['--production', '--execute', '--mode=backfill']),
        {
          TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'PRODUCTION',
          RAILWAY_ENVIRONMENT_NAME: 'production',
          DATABASE_URL: 'runtime-database-input',
        },
      ),
    ).toMatchObject({ DATABASE_URL: 'runtime-database-input' });
  });
  it('rejects ambiguous duplicate targets and validates an optional resume cursor', () => {
    for (const args of [
      ['--workspace=other'],
      ['--mode=migrate', '--mode=backfill'],
      ['--limit=10', '--limit=20'],
    ])
      expect(() => options(args)).toThrow('Duplicate');
    expect(options(['--after=channel-002'])).toMatchObject({
      after: 'channel-002',
    });
    expect(() => options(['--after='])).toThrow('cursor');
    expect(() => options(['--after=*'])).toThrow('cursor');
  });
});

it('rejects LOCAL commands aimed at the production database or host', () => {
  const local = parseAvatarEmojiMaintenanceOptions([
    '--workspace=workspace-id',
    '--mode=smoke',
  ]);
  expect(() =>
    avatarEmojiMaintenanceEnvironment(local, {
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'LOCAL',
      DATABASE_URL: 'postgresql://local@test-pooler.example/db',
      DATABASE_URL_PRODUCTION: 'postgresql://production@test.example/db',
    }),
  ).toThrow('production database');
  expect(() =>
    avatarEmojiMaintenanceEnvironment(local, {
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'LOCAL',
      RAILWAY_ENVIRONMENT_NAME: 'production',
    }),
  ).toThrow('production database');
});
