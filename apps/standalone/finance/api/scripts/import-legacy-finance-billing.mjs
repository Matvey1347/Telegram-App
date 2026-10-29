import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const root = resolve(import.meta.dirname, '..', '..', '..', '..', '..');
loadEnv({ path: resolve(root, 'products/finance/.env.local'), quiet: true });
const pathArgument = process.argv.find(value => value.startsWith('--backup='))?.slice(9);
const apply = process.argv.includes('--apply');
if (!pathArgument) throw new Error('Usage: --backup=.finance-backups/<file>.json.gz [--apply --confirm-legacy-billing-import]');
if (apply && !process.argv.includes('--confirm-legacy-billing-import')) throw new Error('Apply requires explicit confirmation flag');
const backupPath = resolve(root, pathArgument);
if (!backupPath.startsWith(resolve(root, '.finance-backups') + '/')) throw new Error('Backup must be inside .finance-backups');
const raw = gunzipSync(readFileSync(backupPath));
const checksum = createHash('sha256').update(raw).digest('hex');
if (readFileSync(`${backupPath}.sha256`, 'utf8').split(/\s+/)[0] !== checksum) throw new Error('Backup checksum mismatch');
const backup = JSON.parse(raw);
if (backup.version !== 1 || !backup.data || !Array.isArray(backup.financeBotIds)) throw new Error('Unsupported backup format');
const rows = table => backup.data[table] || [];
for (const table of ['TelegramBotUser','BotSubscriptionPlan','BotPlanPrice','BotSubscription','BotSubscriptionGrant','BotBillingEvent','BotProviderSubscription'])
  if (!Array.isArray(backup.data[table])) throw new Error(`Backup lacks ${table}; create a fresh complete backup before import`);
const sourceUsers = new Map(rows('TelegramBotUser').map(row => [row.id, row]));
const plans = new Map(rows('BotSubscriptionPlan').map(row => [row.id, row]));
const grants = new Map();
for (const grant of rows('BotSubscriptionGrant')) grants.set(grant.subscriptionId, [...(grants.get(grant.subscriptionId) || []), grant]);
const providers = new Map(rows('BotProviderSubscription').map(row => [row.subscriptionId, row]));
const paid = rows('BotSubscription').filter(row => ['PRO','ULTIMATE','PLUS'].includes(String(plans.get(row.planId)?.code || '').toUpperCase()));
const targetUrl = process.env.FINANCE_DATABASE_URL;
if (!targetUrl) throw new Error('FINANCE_DATABASE_URL is required');
const client = new pg.Client({ connectionString: targetUrl, statement_timeout: 30_000 });
try {
  await client.connect();
  await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
  const mapping = [];
  for (const subscription of paid) {
    const user = sourceUsers.get(subscription.telegramBotUserId);
    if (!user || !backup.financeBotIds.includes(subscription.botIntegrationId)) throw new Error(`Unscoped legacy subscription ${subscription.id}`);
    const recordedMode = providers.get(subscription.id)?.mode || rows('BotBillingEvent').find(event => event.subscriptionId === subscription.id && event.mode)?.mode;
    if (subscription.source === 'STRIPE' && recordedMode !== 'TEST' && recordedMode !== 'LIVE') throw new Error(`Legacy Stripe subscription ${subscription.id} has no confirmed provider mode`);
    const target = await client.query(`SELECT b.id AS "botId", p.id AS "profileId" FROM "FinanceBot" b JOIN "FinanceTelegramUser" u ON u."financeBotId" = b.id JOIN "FinanceProfile" p ON p."financeTelegramUserId" = u.id WHERE b."legacyBotIntegrationId" = $1 AND u."telegramUserId" = $2`, [subscription.botIntegrationId, user.telegramUserId]);
    if (target.rows.length !== 1) throw new Error(`Legacy user ${subscription.telegramBotUserId} has no unique standalone Finance profile`);
    mapping.push({ subscription, target: target.rows[0] });
  }
  if (!apply) {
    process.stdout.write(JSON.stringify({ mode: 'dry-run', checksum, subscriptions: paid.length, gifts: paid.filter(x => x.source === 'GIFT').length, paidSubscriptions: paid.filter(x => x.source === 'STRIPE').length, events: rows('BotBillingEvent').length, writesPerformed: false }, null, 2) + '\n');
  } else {
    for (const { subscription: source, target } of mapping) {
      const provider = providers.get(source.id);
      const recordedMode = provider?.mode || rows('BotBillingEvent').find(event => event.subscriptionId === source.id && event.mode)?.mode;
      const mode = recordedMode === 'TEST' ? 'TEST' : 'LIVE';
      const applicableGrants = (grants.get(source.id) || []).filter(g => !g.revokedAt && (!g.expiresAt || new Date(g.expiresAt) > new Date()));
      const gift = (source.source === 'GIFT' || source.source === 'MANUAL') && applicableGrants.length > 0;
      const ended = source.currentPeriodEnd && new Date(source.currentPeriodEnd) <= new Date();
      const status = gift ? 'GIFT' : ended ? 'EXPIRED' : source.status === 'ACTIVE' || source.status === 'CANCELED' ? source.status : source.status === 'PAST_DUE' ? 'PAST_DUE' : 'PENDING';
      const until = gift ? (applicableGrants.some(g => !g.expiresAt) ? null : applicableGrants.map(g => new Date(g.expiresAt)).sort((a,b) => b-a)[0]) : source.currentPeriodEnd;
      await client.query(`INSERT INTO "FinanceBillingSubscription" (id,"financeBotId","profileId",mode,offer,status,source,"legacySourceId","stripeCustomerId","stripeSubscriptionId","currentPeriodStart","currentPeriodEnd","cancelAtPeriodEnd","introUsed","createdAt","updatedAt") VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,false,$13,now()) ON CONFLICT ("legacySourceId") DO NOTHING`, [source.id, target.botId, target.profileId, mode, status, gift ? 'GIFT' : 'LEGACY', source.id, source.providerCustomerId, source.providerSubscriptionId, source.currentPeriodStart, until, Boolean(source.cancelAtPeriodEnd), source.createdAt || new Date()]);
      for (const event of rows('BotBillingEvent').filter(e => e.subscriptionId === source.id)) {
        const compact = { id: event.id, provider: event.provider, mode: event.mode, providerEventId: event.providerEventId, type: event.type, amountMinor: event.amountMinor, currency: event.currency, occurredAt: event.occurredAt };
        await client.query(`INSERT INTO "FinanceLegacyArchive" ("sourceTable","sourceId",payload,"backupChecksum") VALUES ('BotBillingEvent',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING`, [event.id, JSON.stringify(compact), checksum]);
        if (!gift && ['PAYMENT_SUCCEEDED','PAYMENT_FAILED'].includes(event.type)) {
          await client.query(`INSERT INTO "FinanceBillingPayment" (id,"profileId","subscriptionId",mode,"stripeEventId","stripeInvoiceId",kind,currency,"amountMinor","internalBonusMinor","confirmedCashMinor","occurredAt") VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,0,0,$9) ON CONFLICT (mode,"stripeEventId") DO NOTHING`, [`legacy-${event.id}`, target.profileId, source.id, mode, event.providerEventId || `legacy:${event.id}`, event.type, event.currency || source.currency || 'UAH', event.amountMinor || 0, event.occurredAt || source.createdAt]);
        }
      }
      for (const grant of grants.get(source.id) || []) {
        const compact = { id: grant.id, subscriptionId: grant.subscriptionId, source: grant.source, startsAt: grant.startsAt, expiresAt: grant.expiresAt, revokedAt: grant.revokedAt };
        await client.query(`INSERT INTO "FinanceLegacyArchive" ("sourceTable","sourceId",payload,"backupChecksum") VALUES ('BotSubscriptionGrant',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING`, [grant.id, JSON.stringify(compact), checksum]);
      }
      const price = rows('BotPlanPrice').find(p => p.id === source.planPriceId);
      if (price) {
        const compact = { id: price.id, planId: price.planId, version: price.version, currency: price.currency, interval: price.interval, amountMinor: price.amountMinor, providerPriceIdentity: price.providerPriceIdentity };
        await client.query(`INSERT INTO "FinanceLegacyArchive" ("sourceTable","sourceId",payload,"backupChecksum") VALUES ('BotPlanPrice',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING`, [price.id, JSON.stringify(compact), checksum]);
      }
    }
    await client.query('COMMIT');
    process.stdout.write(JSON.stringify({ mode: 'apply', checksum, importedSubscriptions: mapping.length, writesPerformed: true }, null, 2) + '\n');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally { await client.end(); }
