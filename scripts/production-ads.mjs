#!/usr/bin/env node
import process from 'node:process';

const usage = `Production ads workflow (existing authenticated API only)

  node scripts/production-ads.mjs read --sale-id <id>
  node scripts/production-ads.mjs recover --sale-id <id> --placement-id <id> [--execute --confirm "PUBLISH SALE <sale-id> PLACEMENT <placement-id>"]

Default mode is read-only/dry-run. Requires PRODUCTION_API_URL (HTTPS) and
PRODUCTION_API_TOKEN in the environment. Never connects to PostgreSQL.`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i];
    if (key === '--execute') options.execute = true;
    else if (['--sale-id', '--placement-id', '--confirm'].includes(key)) {
      if (!rest[i + 1] || rest[i + 1].startsWith('--')) throw new Error(`Missing value for ${key}`);
      options[key.slice(2)] = rest[++i];
    } else throw new Error(`Unknown option: ${key}`);
  }
  if (!['read', 'recover', '--help', '-h'].includes(command)) throw new Error('Choose read or recover.');
  if (command === 'read' && !options['sale-id']) throw new Error('read requires --sale-id.');
  if (command === 'recover' && (!options['sale-id'] || !options['placement-id'])) throw new Error('recover requires --sale-id and --placement-id.');
  if (options.execute) {
    const phrases = [
      `PUBLISH SALE ${options['sale-id']} PLACEMENT ${options['placement-id']}`,
      `RECONCILE SALE ${options['sale-id']} PLACEMENT ${options['placement-id']}`,
    ];
    if (!phrases.includes(options.confirm)) throw new Error('Execution requires an exact --confirm phrase shown by dry-run.');
  }
  if (!options.execute && options.confirm) throw new Error('--confirm is accepted only with --execute.');
  return { command, options };
}

function productionConfig(env) {
  const base = env.PRODUCTION_API_URL;
  const token = env.PRODUCTION_API_TOKEN;
  if (!base || !token) throw new Error('Set PRODUCTION_API_URL and PRODUCTION_API_TOKEN in the protected environment.');
  let url;
  try { url = new URL(base); } catch { throw new Error('PRODUCTION_API_URL must be a valid HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') throw new Error('Production API must use HTTPS and cannot be localhost.');
  return { base: url.toString().replace(/\/$/u, ''), token };
}

async function apiRequest(config, path, method = 'GET', body, fetchImpl = fetch) {
  const response = await fetchImpl(`${config.base}/api${path}`, {
    method,
    headers: { authorization: `Bearer ${config.token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Production API returned HTTP ${response.status} for ${method} ${path}.`);
  return response.status === 204 ? null : response.json();
}

function summarizeSale(sale) {
  return {
    saleId: sale.id,
    title: sale.title ?? null,
    status: sale.status,
    advertiser: sale.advertiserNameSnapshot ?? sale.advertiserName ?? null,
    placements: (sale.placements ?? []).map((placement) => ({
      id: placement.id,
      channelId: placement.telegramChannelId,
      channel: placement.telegramChannel?.username ?? null,
      chatId: placement.telegramChannel?.telegramChatId ?? null,
      status: placement.status,
      scheduledAt: placement.scheduledAt,
      publishedAt: placement.publishedAt,
      telegramPostId: placement.telegramPostId,
      telegramPostUrl: placement.telegramPostUrl ?? null,
      managedPostId: placement.managedPostId,
      managedPostStatus: placement.managedPost?.status ?? null,
      remoteMessageIds: placement.managedPost?.telegramMessageIds ?? [],
      remoteStatus: placement.managedPost?.telegramRemoteStatus ?? null,
      telegramIdentityStatus: placement.managedPost?.telegramIdVerificationStatus ?? null,
      publisherType: placement.managedPost?.sourceType ?? null,
      publisherAccountId: placement.managedPost?.sourceId ?? null,
      lastError: placement.managedPost?.lastError ?? null,
    })),
  };
}

function remoteEvidence(placement) {
  return Boolean(placement.publishedAt || placement.telegramPostId || placement.managedPost?.publishedAt || placement.managedPost?.telegramMessageIds?.length || placement.managedPost?.telegramRemoteStatus === 'PUBLISHED');
}

export async function runProductionAds(argv, env = process.env, fetchImpl = fetch) {
  const { command, options } = parseArgs(argv);
  if (command === '--help' || command === '-h') return usage;
  const config = productionConfig(env);
  const saleId = encodeURIComponent(options['sale-id']);
  const readSale = () => apiRequest(config, `/telegram-ad-sales/${saleId}`, 'GET', undefined, fetchImpl);
  const sale = await readSale();
  if (sale.id !== options['sale-id']) throw new Error('API returned a different deal ID; stopped.');
  if (command === 'read') return JSON.stringify(summarizeSale(sale), null, 2);

  const placement = (sale.placements ?? []).find((item) => item.id === options['placement-id']);
  if (!placement) throw new Error('Placement ID does not belong to this deal; stopped.');
  const summary = summarizeSale(sale);
  const target = summary.placements.find((item) => item.id === placement.id);
  if (remoteEvidence(placement)) {
    if (placement.managedPost?.status !== 'PUBLISHED' || !placement.managedPost?.telegramMessageIds?.length) {
      return JSON.stringify({ mode: options.execute ? 'execute' : 'dry-run', action: 'blocked-uncertain-telegram-publication', reason: 'Telegram delivery evidence is incomplete. No publish request was sent; investigate and reconcile the uncertain outcome before retrying.', target }, null, 2);
    }
    const confirmation = `RECONCILE SALE ${options['sale-id']} PLACEMENT ${options['placement-id']}`;
    if (!options.execute) return JSON.stringify({ mode: 'dry-run', action: 'would-verify-telegram-and-sync-placement', confirmation, target }, null, 2);
    if (options.confirm !== confirmation) throw new Error(`Execution requires the exact confirmation phrase: ${confirmation}`);
    const verification = await apiRequest(config,
      `/telegram-channels/${encodeURIComponent(placement.telegramChannelId)}/managed-posts/${encodeURIComponent(placement.managedPostId)}/verify-telegram-id`,
      'POST', {}, fetchImpl);
    if (verification.status !== 'PUBLISHED' || verification.telegramIdVerificationStatus !== 'VERIFIED' || !verification.telegramMessageIds?.length) {
      return JSON.stringify({ mode: 'execute', action: 'telegram-verification-not-confirmed', verification: { status: verification.status ?? null, identityStatus: verification.telegramIdVerificationStatus ?? null, messageIds: verification.telegramMessageIds ?? [] }, followUp: 'No placement status was changed and no new post was sent.' }, null, 2);
    }
    await apiRequest(config, `/telegram-ad-sales/${saleId}/placements/${encodeURIComponent(placement.id)}/reconcile-published`, 'POST', {}, fetchImpl);
    const reconciled = await readSale();
    const updatedPlacement = (reconciled.placements ?? []).find((item) => item.id === placement.id);
    return JSON.stringify({ mode: 'execute', action: updatedPlacement?.status === 'PUBLISHED' ? 'existing-publication-verified-and-synced' : 'existing-publication-verified-sync-incomplete', telegram: { status: verification.status, messageIds: verification.telegramMessageIds, messageUrls: verification.telegramMessageUrls ?? [] }, database: { placementStatus: updatedPlacement?.status ?? null, publishedAt: updatedPlacement?.publishedAt ?? null }, target: summarizeSale(reconciled).placements.find((item) => item.id === placement.id) }, null, 2);
  }
  if (placement.status === 'PUBLISHED' || placement.managedPost?.status === 'PUBLISHED') {
    return JSON.stringify({ mode: options.execute ? 'execute' : 'dry-run', action: 'blocked-inconsistent-state', reason: 'Database says published but remote message evidence is missing. No publish request was sent.', target }, null, 2);
  }
  if (!placement.managedPostId) throw new Error('Placement has no managed post to publish; stopped.');
  const confirmation = `PUBLISH SALE ${options['sale-id']} PLACEMENT ${options['placement-id']}`;
  if (!options.execute) return JSON.stringify({ mode: 'dry-run', action: 'would-publish-one-placement', confirmation, target }, null, 2);
  if (options.confirm !== confirmation) throw new Error(`Execution requires the exact confirmation phrase: ${confirmation}`);

  const path = `/telegram-ad-sales/${saleId}/placements/${encodeURIComponent(placement.id)}/publish`;
  let publishResult;
  try {
    publishResult = await apiRequest(config, path, 'POST', {}, fetchImpl);
  } catch (error) {
    return JSON.stringify({ mode: 'execute', action: 'publish-request-failed', error: error.message, followUp: 'Read the same deal before retrying; Telegram outcome may be uncertain.' }, null, 2);
  }
  let after;
  try { after = await readSale(); }
  catch (error) { return JSON.stringify({ mode: 'execute', action: 'published-or-accepted-but-verification-failed', publishResult, verificationError: error.message, followUp: 'Do not retry until the deal is reread.' }, null, 2); }
  const verified = (after.placements ?? []).find((item) => item.id === placement.id);
  return JSON.stringify({
    mode: 'execute',
    action: verified?.status === 'PUBLISHED' && remoteEvidence(verified) ? 'published-and-verified' : 'request-finished-verification-incomplete',
    placementId: placement.id,
    database: { placementStatus: verified?.status ?? null, publishedAt: verified?.publishedAt ?? null, managedPostStatus: verified?.managedPost?.status ?? null },
    telegram: { messageIds: verified?.managedPost?.telegramMessageIds ?? [], urls: verified?.managedPost?.telegramMessageUrls ?? [], postUrl: verified?.telegramPostUrl ?? null, remoteStatus: verified?.managedPost?.telegramRemoteStatus ?? null },
    publishResult,
    failure: verified?.managedPost?.lastError ?? null,
  }, null, 2);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runProductionAds(process.argv.slice(2)).then((output) => process.stdout.write(`${output}\n`)).catch((error) => {
    process.stderr.write(`Production ads workflow stopped: ${error.message}\n`);
    process.exitCode = 1;
  });
}
