/** Development-only recovery host configuration; never used by AppModule. */
export function productionRecoveryConfig(environment = process.env) {
  if (
    environment.NODE_ENV === 'production' ||
    environment.PRODUCTION_RECOVERY_ENABLED !== 'true'
  )
    throw new Error(
      'The localhost recovery host must be explicitly enabled in development',
    );
  const required = (name: string) => {
    const value = environment[name]?.trim();
    if (!value) throw new Error(`Missing recovery setting: ${name}`);
    return value;
  };
  const port = (name: string, fallback: number) => {
    const value = Number(environment[name] || fallback);
    if (!Number.isInteger(value) || value < 1024 || value > 65535)
      throw new Error('Invalid recovery port');
    return value;
  };
  const productionApiOrigin = required('PRODUCTION_API_URL').replace(/\/$/, '');
  const parsed = new URL(productionApiOrigin);
  if (
    productionApiOrigin !== 'https://api.nexeloq.com/api' ||
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      'Recovery transport requires a credential-free HTTPS API URL',
    );
  const capability = required('PRODUCTION_RECOVERY_CAPABILITY');
  if (!/^[0-9a-f]{64}$/.test(capability))
    throw new Error('Invalid operator capability');
  return {
    capability,
    saleId: environment.PRODUCTION_RECOVERY_SALE_ID,
    placementId: environment.PRODUCTION_RECOVERY_PLACEMENT_ID,
    userId: required('PRODUCTION_RECOVERY_USER_ID'),
    channelId: required('PRODUCTION_RECOVERY_CHANNEL_ID'),
    workspaceId: required('PRODUCTION_RECOVERY_WORKSPACE_ID'),
    apiPort: port('PRODUCTION_RECOVERY_API_PORT', 4003),
    productionApiOrigin,
  };
}
