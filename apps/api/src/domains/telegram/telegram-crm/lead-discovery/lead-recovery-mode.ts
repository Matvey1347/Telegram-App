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
