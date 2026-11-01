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
    (isProductionEnvironment(environment) ||
      telegramBotRuntimeEnvironmentName(environment) === 'PRODUCTION') &&
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

/** Optional standalone Finance site origin for legal links from the legacy bot. */
export function financeStandaloneWebOrigin(
  environment: DeploymentEnvironment = process.env,
) {
  const origin = normalizedOrigin(environment.FINANCE_WEB_PUBLIC_URL);
  if (!origin) return undefined;
  const parsed = new URL(origin);
  return parsed.protocol === 'https:' || parsed.hostname === 'localhost'
    ? origin
    : undefined;
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

/**
 * A local Bot API runtime can share a development database, but must never
 * become a second background worker for user-owned MTProto sessions stored in
 * a production database. Those sessions are bound to a Telegram auth key and
 * Telegram revokes the key when two hosts use it concurrently.
 */
export function isLocalTelegramBotRuntime(
  environment: DeploymentEnvironment = process.env,
) {
  return telegramBotRuntimeEnvironmentName(environment) === 'LOCAL';
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
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

export function apiPort(environment: DeploymentEnvironment = process.env) {
  const configured = Number(environment.PORT || environment.API_PORT);
  return Number.isFinite(configured) && configured > 0 ? configured : 4000;
}

/**
 * Number of ingress hops allowed to supply the client IP. Production defaults
 * to Railway's single reverse-proxy hop; direct local development trusts none.
 */
export function trustedProxyHops(
  environment: DeploymentEnvironment = process.env,
) {
  const configured = Number(environment.TRUST_PROXY_HOPS);
  if (Number.isInteger(configured) && configured >= 0 && configured <= 5) {
    return configured;
  }
  return isProductionEnvironment(environment) ? 1 : 0;
}

/** Explicit rollout boundary: legacy manual text remains available when chat actions are off. */
export function crmChatRollout(
  environment: DeploymentEnvironment = process.env,
) {
  const flag = (key: 'CRM_CHAT_ACTIONS_ENABLED' | 'CRM_CHAT_MEDIA_ENABLED') => {
    const value = nonBlank(environment[key])?.toLowerCase();
    if (value && value !== 'true' && value !== 'false')
      throw new Error(`${key} must be true or false`);
    return value === 'true';
  };
  return {
    actions: flag('CRM_CHAT_ACTIONS_ENABLED'),
    media: flag('CRM_CHAT_MEDIA_ENABLED'),
  };
}

/** Allow compatibility API hosts to avoid owning the shared CRM MTProto runtime. */
export function crmRuntimeProxyOrigin(
  environment: DeploymentEnvironment = process.env,
) {
  const configured = nonBlank(environment.CRM_RUNTIME_PROXY_URL);
  if (!configured) return undefined;
  let target: URL;
  try {
    target = new URL(configured);
  } catch {
    throw new Error('CRM_RUNTIME_PROXY_URL must be a trusted HTTP origin');
  }
  const localHttp =
    target.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) &&
    !isProductionEnvironment(environment);
  if (
    (!localHttp && target.protocol !== 'https:') ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== '/'
  )
    throw new Error('CRM_RUNTIME_PROXY_URL must be a trusted HTTP origin');
  return target.origin;
}

export function crmRuntimeEnabled(
  environment: DeploymentEnvironment = process.env,
) {
  if (environment.CRM_RUNTIME_ENABLED?.trim().toLowerCase() === 'false')
    return false;
  if (crmRuntimeProxyOrigin(environment)) return false;
  const configuredOwnerPort = nonBlank(environment.CRM_RUNTIME_OWNER_API_PORT);
  if (!configuredOwnerPort) return true;
  const ownerPort = Number(configuredOwnerPort);
  if (!Number.isInteger(ownerPort) || ownerPort < 1 || ownerPort > 65535)
    throw new Error('CRM_RUNTIME_OWNER_API_PORT must be a valid TCP port');
  return apiPort(environment) === ownerPort;
}
