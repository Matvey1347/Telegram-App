import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import {
  isProductionEnvironment,
  telegramBotRuntimeEnvironmentName,
} from './deployment-config';

const supportKeys = [
  'FINANCE_BOT_SUPPORT_USERNAME',
  'FINANCE_BOT_SUPPORT_TOKEN',
  'FINANCE_BOT_SUPPORT_WEBHOOK_SECRET',
  'FINANCE_BOT_DASHBOARD_WORKSPACE_ID',
] as const;

/** Support configuration is also needed by the local dashboard without a bot runtime. */
export function loadFinanceLocalSupportConfig() {
  const runtime = telegramBotRuntimeEnvironmentName();
  if (
    isProductionEnvironment() ||
    (runtime !== undefined && runtime !== 'LOCAL')
  )
    return {};
  try {
    const profile = parse(
      readFileSync(resolve(process.cwd(), '../../products/finance/.env.local')),
    );
    return Object.fromEntries(
      supportKeys.flatMap((key) =>
        profile[key]?.trim() ? [[key, profile[key]]] : [],
      ),
    );
  } catch {
    return {};
  }
}
