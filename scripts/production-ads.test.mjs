import assert from 'node:assert/strict';
import test from 'node:test';
import { runProductionAds } from './production-ads.mjs';

const sale = {
  id: 'sale-1', status: 'CONFIRMED', advertiserName: 'Buyer',
  placements: [{ id: 'placement-1', telegramChannelId: 'channel-1', telegramChannel: { username: 'news', telegramChatId: '-1001' }, status: 'SCHEDULED', scheduledAt: '2026-11-01T10:00:00.000Z', publishedAt: null, telegramPostId: null, telegramPostUrl: null, managedPostId: 'post-1', managedPost: { status: 'SCHEDULED', telegramMessageIds: [], telegramRemoteStatus: 'NONE', lastError: null } }],
};
const env = { PRODUCTION_API_URL: 'https://api.example.test', PRODUCTION_API_TOKEN: 'secret' };
function mockFetch(sequence) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, authorization: init.headers.authorization });
    const item = sequence.shift();
    if (item instanceof Error) throw item;
    return { ok: item.status !== 500, status: item.status ?? 200, json: async () => item.body };
  };
  return { calls, fetchImpl };
}

test('read prints scoped deal and channel diagnostics without exposing its token', async () => {
  const mock = mockFetch([{ body: sale }]);
  const output = await runProductionAds(['read', '--sale-id', 'sale-1'], env, mock.fetchImpl);
  assert.match(output, /news/u);
  assert.match(output, /SCHEDULED/u);
  assert.equal(output.includes('secret'), false);
  assert.equal(mock.calls[0].method, 'GET');
});

test('recover is dry-run by default and never issues a write', async () => {
  const mock = mockFetch([{ body: sale }]);
  const output = await runProductionAds(['recover', '--sale-id', 'sale-1', '--placement-id', 'placement-1'], env, mock.fetchImpl);
  assert.match(output, /would-publish-one-placement/u);
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].method, 'GET');
});

test('execution requires exact deal and placement confirmation', async () => {
  await assert.rejects(runProductionAds(['recover', '--sale-id', 'sale-1', '--placement-id', 'placement-1', '--execute', '--confirm', 'yes'], env), /exact --confirm/u);
});

test('existing Telegram message evidence selects reconciliation instead of publishing', async () => {
  const alreadyPublished = structuredClone(sale);
  alreadyPublished.placements[0].publishedAt = '2026-11-17T10:00:00.000Z';
  alreadyPublished.placements[0].managedPost.status = 'PUBLISHED';
  alreadyPublished.placements[0].managedPost.publishedAt = '2026-11-17T10:00:00.000Z';
  alreadyPublished.placements[0].managedPost.telegramMessageIds = ['123'];
  const mock = mockFetch([{ body: alreadyPublished }]);
  const output = await runProductionAds(['recover', '--sale-id', 'sale-1', '--placement-id', 'placement-1'], env, mock.fetchImpl);
  assert.match(output, /would-verify-telegram-and-sync-placement/u);
  assert.equal(mock.calls.length, 1);
});

test('existing Telegram publication is verified and placement DB state is synced without publish', async () => {
  const alreadyPublished = structuredClone(sale);
  Object.assign(alreadyPublished.placements[0], { status: 'SCHEDULED', publishedAt: '2026-11-17T10:00:00.000Z' });
  Object.assign(alreadyPublished.placements[0].managedPost, { status: 'PUBLISHED', publishedAt: '2026-11-17T10:00:00.000Z', telegramMessageIds: ['123'] });
  const synchronized = structuredClone(alreadyPublished);
  synchronized.placements[0].status = 'PUBLISHED';
  const mock = mockFetch([
    { body: alreadyPublished },
    { body: { status: 'PUBLISHED', telegramIdVerificationStatus: 'VERIFIED', telegramMessageIds: ['123'], telegramMessageUrls: ['https://t.me/news/123'] } },
    { body: synchronized },
    { body: synchronized },
  ]);
  const output = await runProductionAds(['recover', '--sale-id', 'sale-1', '--placement-id', 'placement-1', '--execute', '--confirm', 'RECONCILE SALE sale-1 PLACEMENT placement-1'], env, mock.fetchImpl);
  assert.match(output, /existing-publication-verified-and-synced/u);
  assert.deepEqual(mock.calls.map((call) => call.method), ['GET', 'POST', 'POST', 'GET']);
  assert.ok(mock.calls[1].url.endsWith('/telegram-channels/channel-1/managed-posts/post-1/verify-telegram-id'));
  assert.ok(mock.calls[2].url.endsWith('/telegram-ad-sales/sale-1/placements/placement-1/reconcile-published'));
});

test('confirmed execution calls the existing publish endpoint and rereads persisted Telegram result', async () => {
  const published = structuredClone(sale);
  Object.assign(published.placements[0], { status: 'PUBLISHED', publishedAt: '2026-11-17T12:00:00.000Z' });
  Object.assign(published.placements[0].managedPost, { status: 'PUBLISHED', publishedAt: '2026-11-17T12:00:00.000Z', telegramMessageIds: ['456'], telegramMessageUrls: ['https://t.me/news/456'], telegramRemoteStatus: 'PUBLISHED' });
  const mock = mockFetch([{ body: sale }, { body: { id: 'placement-1', status: 'PUBLISHED' } }, { body: published }]);
  const output = await runProductionAds(['recover', '--sale-id', 'sale-1', '--placement-id', 'placement-1', '--execute', '--confirm', 'PUBLISH SALE sale-1 PLACEMENT placement-1'], env, mock.fetchImpl);
  assert.match(output, /published-and-verified/u);
  assert.match(output, /"456"/u);
  assert.deepEqual(mock.calls.map((call) => call.method), ['GET', 'POST', 'GET']);
  assert.ok(mock.calls[1].url.endsWith('/telegram-ad-sales/sale-1/placements/placement-1/publish'));
});

test('uncertain publish response is reported and must be reread before retry', async () => {
  const mock = mockFetch([{ body: sale }, new Error('connection reset')]);
  const output = await runProductionAds(['recover', '--sale-id', 'sale-1', '--placement-id', 'placement-1', '--execute', '--confirm', 'PUBLISH SALE sale-1 PLACEMENT placement-1'], env, mock.fetchImpl);
  assert.match(output, /publish-request-failed/u);
  assert.match(output, /outcome may be uncertain/u);
  assert.equal(mock.calls.length, 2);
});

test('rejects non-HTTPS and local production targets', async () => {
  await assert.rejects(runProductionAds(['read', '--sale-id', 'sale-1'], { ...env, PRODUCTION_API_URL: 'http://api.example.test' }), /HTTPS/u);
  await assert.rejects(runProductionAds(['read', '--sale-id', 'sale-1'], { ...env, PRODUCTION_API_URL: 'https://localhost' }), /localhost/u);
});
