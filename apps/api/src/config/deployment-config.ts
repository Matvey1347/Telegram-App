export type DeploymentEnvironment = NodeJS.ProcessEnv;

function nonBlank(value: string | undefined) {
  return value?.trim() || undefined;
}

function normalizedOrigin(value: string | undefined) {
  const configured = nonBlank(value);
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

function isDevelopmentTunnelOrigin(origin: string) {
  const host = new URL(origin).hostname.toLowerCase();
  return (
    host === 'ngrok.io' ||
    host.endsWith('.ngrok.io') ||
    host === 'ngrok-free.app' ||
    host.endsWith('.ngrok-free.app') ||
    host === 'trycloudflare.com' ||
    host.endsWith('.trycloudflare.com')
  );
}

/** Canonical public origin for every web application hosted by this deployment. */
export function publicWebOrigin(
  environment: DeploymentEnvironment = process.env,
) {
  const origin = normalizedOrigin(environment.FRONTEND_URL);
  if (
    origin &&
    isProductionEnvironment(environment) &&
    isDevelopmentTunnelOrigin(origin)
  ) {
    return undefined;
  }
  return origin;
}

/** Public API callback origin when the API is exposed separately from the web app. */
export function publicApiOrigin(
  environment: DeploymentEnvironment = process.env,
) {
  return normalizedOrigin(environment.API_PUBLIC_URL);
}

export function runtimeEnvironmentName(
  environment: DeploymentEnvironment = process.env,
) {
  return configuredRuntimeEnvironmentName(environment) || 'development';
}

export function configuredRuntimeEnvironmentName(
  environment: DeploymentEnvironment = process.env,
) {
  return nonBlank(environment.NODE_ENV);
}

export function isProductionEnvironment(
  environment: DeploymentEnvironment = process.env,
) {
  return runtimeEnvironmentName(environment) === 'production';
}

export function telegramBotRuntimeEnvironmentName(
  environment: DeploymentEnvironment = process.env,
) {
  return nonBlank(environment.TELEGRAM_BOT_RUNTIME_ENVIRONMENT)?.toUpperCase();
}

export function deploymentFlag(
  key:
    | 'APP_LOG_HTTP_ENABLED'
    | 'APP_LOG_HTTP_SUCCESS_ENABLED'
    | 'MEMORY_MONITOR_DETAILED_TELEMETRY'
    | 'MEMORY_MONITOR_ENABLED',
  environment: DeploymentEnvironment = process.env,
) {
  return nonBlank(environment[key])?.toLowerCase();
}

export function deploymentValue(
  key:
    | 'APP_CONSOLE_LOG_LEVEL'
    | 'APP_LOG_MIN_LEVEL'
    | 'LOCAL_DEV_BOTS_CONTROL_SECRET'
    | 'MEMORY_MONITOR_WARN_RSS_MB',
  environment: DeploymentEnvironment = process.env,
) {
  return nonBlank(environment[key]);
}

export function positiveDeploymentNumber(
  key: 'MEMORY_MONITOR_WARN_RSS_MB',
  fallback: number,
  environment: DeploymentEnvironment = process.env,
) {
  const configured = Number(deploymentValue(key, environment));
  return Number.isFinite(configured) && configured > 0
    ? configured
    : fallback;
}

export function apiPort(environment: DeploymentEnvironment = process.env) {
  const configured = Number(environment.PORT || environment.API_PORT);
  return Number.isFinite(configured) && configured > 0 ? configured : 4000;
}
