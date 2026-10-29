import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import Stripe from 'stripe';
import { PrismaClient } from '../src/generated/prisma/client.js';

loadEnv({ path: resolve(process.cwd(), '../../../../products/finance/.env.local'), quiet: true });
const mode = process.argv.find(x => x.startsWith('--mode='))?.split('=')[1];
const apply = process.argv.includes('--apply');
if (!['TEST','LIVE'].includes(mode)) throw new Error('Specify --mode=TEST or --mode=LIVE');
if (apply && !process.argv.includes('--confirm-finance-stripe-sync')) throw new Error('Apply requires --confirm-finance-stripe-sync');
const databaseUrl = process.env.FINANCE_DATABASE_URL;
const key = process.env[`FINANCE_STRIPE_${mode}_SECRET_KEY`];
if (!databaseUrl) throw new Error('FINANCE_DATABASE_URL is required');
if (apply && (!key || !key.startsWith(mode === 'TEST' ? 'sk_test_' : 'sk_live_'))) throw new Error(`Finance Stripe ${mode} key is required`);
const catalog = JSON.parse(readFileSync(new URL('../src/billing/finance-billing-offers.json', import.meta.url), 'utf8'));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const lock = new pg.Client({ connectionString: databaseUrl });
let locked = false;
try {
  await prisma.$connect();
  if (apply) {
    await lock.connect();
    const acquired = await lock.query("SELECT pg_try_advisory_lock(hashtext('finance-billing-sync'), hashtext($1)) AS locked", [mode]);
    locked = Boolean(acquired.rows[0]?.locked);
    if (!locked) throw new Error('Finance Stripe catalog sync is already running');
  }
  const stripe = apply ? new Stripe(key) : null;
  let productId = (await prisma.financeBillingPrice.findFirst({ where: { mode, stripeProductId: { not: null } }, select: { stripeProductId: true } }))?.stripeProductId || null;
  for (const [offer, spec] of Object.entries(catalog)) {
    const rows = await prisma.financeBillingPrice.findMany({ where: { mode, offer }, orderBy: { version: 'desc' } });
    const current = rows.find(x => x.isCurrent);
    const matching = current?.amountMinor === spec.amountMinor && current?.currency === 'UAH' ? current : null;
    if (!apply) {
      process.stdout.write(`${mode} ${offer}: ${matching?.stripePriceId ? 'unchanged' : matching ? 'map Stripe price' : 'create price version'} ${spec.amountMinor} UAH minor units\n`);
      continue;
    }
    if (matching?.stripePriceId) {
      const remote = await stripe.prices.retrieve(matching.stripePriceId);
      if (remote.unit_amount !== spec.amountMinor || remote.currency.toUpperCase() !== 'UAH' || remote.recurring?.interval !== spec.interval || remote.recurring?.interval_count !== spec.intervalCount)
        throw new Error(`Mapped Stripe price for ${offer} conflicts with Finance catalog`);
      process.stdout.write(`${mode} ${offer}: unchanged\n`);
      continue;
    }
    if (!productId) {
      const products = await stripe.products.search({ query: "metadata['financeProduct']:'PLUS'", limit: 10 });
      productId = products.data.find(x => x.active)?.id || (await stripe.products.create({ name: 'Finance PLUS', metadata: { financeProduct: 'PLUS' } }, { idempotencyKey: `finance-plus-product:${mode}` })).id;
    }
    const version = matching?.version || (rows[0]?.version || 0) + 1;
    const lookupKey = `finance_plus_${mode.toLowerCase()}_${offer.toLowerCase()}_v${version}`;
    const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    if (existing.data[0] && (
      existing.data[0].unit_amount !== spec.amountMinor ||
      existing.data[0].currency.toUpperCase() !== 'UAH' ||
      existing.data[0].recurring?.interval !== spec.interval ||
      existing.data[0].recurring?.interval_count !== spec.intervalCount ||
      (typeof existing.data[0].product === 'string' ? existing.data[0].product : existing.data[0].product.id) !== productId
    )) throw new Error(`Stripe lookup key ${lookupKey} conflicts with Finance catalog`);
    const stripePrice = existing.data[0] || await stripe.prices.create({ product: productId, currency: 'uah', unit_amount: spec.amountMinor,
      recurring: { interval: spec.interval, interval_count: spec.intervalCount }, lookup_key: lookupKey,
      metadata: { financeProduct: 'PLUS', offer, version: String(version) },
    }, { idempotencyKey: lookupKey });
    if (matching) {
      await prisma.financeBillingPrice.update({ where: { id: matching.id }, data: { stripeProductId: productId, stripePriceId: stripePrice.id } });
    } else {
      await prisma.$transaction(async tx => {
        await tx.financeBillingPrice.updateMany({ where: { mode, offer, isCurrent: true }, data: { isCurrent: false } });
        await tx.financeBillingPrice.create({ data: { mode, offer, version, amountMinor: spec.amountMinor, currency: 'UAH', stripeProductId: productId, stripePriceId: stripePrice.id, isCurrent: true } });
      });
    }
    process.stdout.write(`${mode} ${offer}: synchronized version ${version}\n`);
  }
} catch (error) {
  if (error?.code === 'P2021') throw new Error('Finance billing tables are absent; apply the additive Finance migration before billing:sync.');
  throw error;
} finally {
  if (locked) await lock.query("SELECT pg_advisory_unlock(hashtext('finance-billing-sync'), hashtext($1))", [mode]);
  if (apply) await lock.end();
  await prisma.$disconnect();
}
