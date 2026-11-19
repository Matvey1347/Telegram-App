import { config } from 'dotenv';

export type AvatarEmojiMaintenanceOptions = {
  mode: 'migrate' | 'backfill' | 'smoke';
  workspaceId: string;
  execute: boolean;
  production: boolean;
  limit: number;
  after?: string;
};

export function parseAvatarEmojiMaintenanceOptions(
  args: string[],
): AvatarEmojiMaintenanceOptions {
  const allowed = ['workspace', 'mode', 'limit', 'after'];
  if (
    allowed.some(
      (key) => args.filter((arg) => arg.startsWith(`--${key}=`)).length > 1,
    )
  )
    throw new Error('Duplicate maintenance scope option.');
  const value = (key: string) =>
    args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
  if (
    args.some(
      (arg) =>
        !['--execute', '--dry-run', '--production'].includes(arg) &&
        !allowed.some((key) => arg.startsWith(`--${key}=`)),
    )
  )
    throw new Error('Unknown maintenance option.');
  if (args.includes('--execute') && args.includes('--dry-run'))
    throw new Error('Choose execute or dry-run.');
  const workspaceId = value('workspace');
  if (!workspaceId || !/^[a-zA-Z0-9_-]{1,100}$/.test(workspaceId))
    throw new Error('A precise --workspace=<id> is required.');
  const mode = value('mode') ?? 'migrate';
  if (mode !== 'migrate' && mode !== 'backfill' && mode !== 'smoke')
    throw new Error('Mode must be migrate, backfill or smoke.');
  const limit = Number(value('limit') ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('Limit must be 1–1000.');
  const production = args.includes('--production');
  if (mode === 'smoke' && production)
    throw new Error('Smoke uses LOCAL System Bot only.');
  const after = value('after');
  if (after !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(after))
    throw new Error('Invalid resume cursor.');
  return {
    workspaceId,
    mode,
    limit,
    production,
    execute: args.includes('--execute'),
    ...(after ? { after } : {}),
  };
}

/** One-shot boundary: never starts an HTTP host, worker, cron or MTProto session. */
export function avatarEmojiMaintenanceEnvironment(
  options: AvatarEmojiMaintenanceOptions,
  environment: NodeJS.ProcessEnv = process.env,
) {
  config({ path: '../../.env', quiet: true });
  if (!options.production) {
    const identity = (value: string | undefined) => {
      if (!value) return null;
      try {
        const url = new URL(value);
        return `${url.hostname.replace(/-pooler(?=\.)/, '')}${url.pathname}`;
      } catch {
        return value;
      }
    };
    if (
      environment.RAILWAY_ENVIRONMENT_NAME === 'production' ||
      environment.DATABASE_ENV?.toUpperCase() === 'PRODUCTION' ||
      (identity(environment.DATABASE_URL_PRODUCTION) &&
        identity(environment.DATABASE_URL_PRODUCTION) ===
          identity(environment.DATABASE_URL))
    )
      throw new Error(
        'LOCAL maintenance cannot target the production database.',
      );
  }
  if (options.production) {
    const url =
      environment.DATABASE_URL_PRODUCTION ||
      (environment.RAILWAY_ENVIRONMENT_NAME === 'production'
        ? environment.DATABASE_URL
        : undefined);
    if (!url)
      throw new Error(
        'DATABASE_URL_PRODUCTION is required for a production dry-run.',
      );
    if (
      options.execute &&
      environment.TELEGRAM_SYSTEM_BOT_ENVIRONMENT !== 'PRODUCTION'
    )
      throw new Error(
        'Production execution requires TELEGRAM_SYSTEM_BOT_ENVIRONMENT=PRODUCTION.',
      );
    environment.DATABASE_URL = url;
  } else if (environment.TELEGRAM_SYSTEM_BOT_ENVIRONMENT !== 'LOCAL') {
    throw new Error(
      'Local maintenance requires TELEGRAM_SYSTEM_BOT_ENVIRONMENT=LOCAL.',
    );
  }
  if (
    options.execute &&
    options.mode === 'backfill' &&
    options.production &&
    environment.RAILWAY_ENVIRONMENT_NAME !== 'production'
  )
    throw new Error(
      'Fresh production MTProto photos must be processed on the production host.',
    );
  return {
    ...environment,
    TELEGRAM_SYSTEM_BOT_ENVIRONMENT: options.production
      ? 'PRODUCTION'
      : 'LOCAL',
  };
}
