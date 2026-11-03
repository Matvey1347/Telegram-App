import type { ConfigService } from '@nestjs/config';

/** Missing configuration retains normal recovery. Invalid values fail closed. */
export function isLeadManualRecovery(config: ConfigService): boolean {
  const mode = config.get<string>('INTERNAL_LEAD_DISCOVERY_RECOVERY_MODE');
  if (mode === 'manual') return true;
  if (mode !== undefined && mode !== '' && mode !== 'normal')
    throw new Error('LEAD_RECOVERY_MODE_INVALID');
  const url = config.get<string>('DATABASE_URL');
  if (url && !config.get<string>('RAILWAY_ENVIRONMENT_ID')) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host))
        return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** Optional deployment-scoped restriction; absent means the existing behaviour. */
export function leadRecoverySources(
  config: ConfigService,
): string[] | undefined {
  const value = config.get<string>('INTERNAL_LEAD_DISCOVERY_SOURCE_ALLOWLIST');
  if (value === undefined) return undefined;
  const ids = value.split(',').map((id) => id.trim());
  if (
    !ids.length ||
    ids.length > 30 ||
    ids.some((id) => !/^[a-z0-9_-]{1,100}$/i.test(id))
  )
    throw new Error('LEAD_SOURCE_ALLOWLIST_INVALID');
  return [...new Set(ids)];
}

export function leadRecoverySourceAllowed(
  config: ConfigService,
  sourceId: string,
): boolean {
  return leadRecoverySources(config)?.includes(sourceId) ?? true;
}
