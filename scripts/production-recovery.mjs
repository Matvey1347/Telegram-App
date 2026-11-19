import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdirSync, openSync, closeSync } from 'node:fs';

// Startup failures from URL/database libraries can carry credential-bearing inputs.
let stopFlow;
const failSafely = () => {
  console.error('Local production recovery failed; credentials and provider errors were suppressed.');
  if (stopFlow) void stopFlow(1);
  else process.exit(1);
};
process.on('uncaughtException', failSafely);
process.on('unhandledRejection', failSafely);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/api/package.json'));
const { Client } = require('pg');
const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
const channelId = option('--channel-id');
const workspaceId = option('--workspace-id');
const envFile = option('--env-file');
if (!channelId || !workspaceId || !envFile || args.includes('--help')) {
  console.log('Usage: node scripts/production-recovery.mjs --channel-id ID --workspace-id ID --env-file /private/path/.env');
  process.exit(args.includes('--help') ? 0 : 1);
}
// Load into this process only. Never put credential-bearing values in argv.
const environment = {};
require('dotenv').config({ path: resolve(envFile), processEnv: environment, quiet: true });
const databaseUrl = environment.DATABASE_URL_PRODUCTION;
if (!databaseUrl || !environment.JWT_SECRET || !environment.BOT_TOKEN_ENCRYPTION_KEY)
  throw new Error('Production database, signing and encryption settings are required');
const db = new Client({ connectionString: databaseUrl });
await db.connect();
let owner;
try {
  await db.query('BEGIN READ ONLY');
  const channel = await db.query('SELECT id FROM "TelegramChannel" WHERE id=$1 AND "workspaceId"=$2 AND "isActive"=true', [channelId, workspaceId]);
  if (channel.rowCount !== 1) throw new Error('Recovery channel does not belong to this workspace');
  owner = (await db.query('SELECT m."userId",u.email,u."authVersion" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE m."workspaceId"=$1 AND m.role=\'owner\' ORDER BY m."createdAt" LIMIT 1', [workspaceId])).rows[0];
  if (!owner) throw new Error('Recovery workspace has no owner');
} finally { await db.query('ROLLBACK'); await db.end(); }
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner.userId, email: owner.email, ver: owner.authVersion, iat: now, exp: now + 7200 })}`;
const token = `${unsigned}.${createHmac('sha256', environment.JWT_SECRET).update(unsigned).digest('base64url')}`;
const apiPort = Number(option('--api-port') || 4003);
const webPort = Number(option('--web-port') || 3003);
const nextPort = webPort + 1;
if (![apiPort, webPort, nextPort].every((port) => Number.isInteger(port) && port >= 1024 && port <= 65535) || new Set([apiPort, webPort, nextPort]).size !== 3)
  throw new Error('Recovery ports must be distinct valid unprivileged ports');
const productionApi = option('--production-api') || 'https://api.nexeloq.com/api';
const productionUrl = new URL(productionApi);
if (productionUrl.protocol !== 'https:' || productionUrl.username || productionUrl.password || productionUrl.search || productionUrl.hash)
  throw new Error('Production API must be a credential-free HTTPS URL');
mkdirSync(resolve(root, '.codex/tmp'), { recursive: true, mode: 0o700 });
const children = [];
const logs = [];
const start = (name, command, commandArgs, cwd, env) => {
  const log = openSync(resolve(root, `.codex/tmp/production-recovery-${name}.log`), 'w', 0o600);
  logs.push(log);
  const child = spawn(command, commandArgs, { cwd, env, stdio: ['ignore', log, log] });
  children.push(child);
  child.once('exit', (code) => { if (!stopping) { console.error(`Recovery ${name} exited (${code}); stopping local flow.`); void stop(1); } });
  return child;
};
let stopping = false;
let gateway;
const stop = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  gateway?.closeAllConnections(); gateway?.close();
  for (const child of children) child.kill('SIGTERM');
  await Promise.race([Promise.all(children.map((child) => child.exitCode !== null ? Promise.resolve() : new Promise((done) => child.once('exit', done)))), new Promise((done) => setTimeout(done, 5000))]);
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  for (const log of logs) closeSync(log);
  process.exit(code);
};
stopFlow = stop;
process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
const base = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
start('api', process.execPath, ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', 'src/maintenance/production-recovery.bootstrap.ts'], resolve(root, 'apps/api'), {
  ...base, ...environment, NODE_ENV: 'development', DATABASE_URL: databaseUrl,
  PRODUCTION_RECOVERY_ENABLED: 'true', PRODUCTION_RECOVERY_CHANNEL_ID: channelId, PRODUCTION_RECOVERY_WORKSPACE_ID: workspaceId,
  PRODUCTION_RECOVERY_API_PORT: String(apiPort), PRODUCTION_RECOVERY_WEB_PORT: String(webPort), PRODUCTION_API_URL: productionApi, PRODUCTION_API_TOKEN: token,
  INTERNAL_AI_ENABLED: 'false', CRM_RUNTIME_ENABLED: 'false', MEMORY_MONITOR_ENABLED: 'false', APP_LOG_HTTP_ENABLED: 'false',
});
// Public web child deliberately receives no database, encryption or signing credentials.
start('web', process.execPath, [require.resolve('next/dist/bin/next', { paths: [resolve(root, 'apps/web')] }), 'dev', '--hostname', '127.0.0.1', '--port', String(nextPort)], resolve(root, 'apps/web'), {
  ...base, NODE_ENV: 'development', NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}/api`, NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_DATABASE_ENV: 'production',
});
gateway = createServer((req, res) => {
  if (req.headers.host !== `localhost:${webPort}` && req.headers.host !== `127.0.0.1:${webPort}`) { res.writeHead(403).end(); return; }
  if (req.url === '/__recovery/start') {
    if (req.method !== 'GET' || !['none', 'same-origin', undefined].includes(req.headers['sec-fetch-site'])) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; frame-ancestors 'none'" });
    const values = JSON.stringify({ token, workspaceId, path: `/telegram-posts/${channelId}/editor` }).replaceAll('<', '\\u003c');
    res.end(`<!doctype html><title>Local recovery</title><script>const v=${values};localStorage.setItem('telegram_system_access_token',v.token);localStorage.setItem('selected-workspace-id',v.workspaceId);location.replace(v.path)</script>`);
    return;
  }
  const upstream = request({ hostname: '127.0.0.1', port: nextPort, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${webPort}` } }, (incoming) => { res.writeHead(incoming.statusCode || 502, incoming.headers); incoming.pipe(res); });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Local web is starting'); });
  req.pipe(upstream);
});
gateway.on('upgrade', (req, socket, head) => {
  if (req.headers.host !== `localhost:${webPort}` && req.headers.host !== `127.0.0.1:${webPort}`) { socket.destroy(); return; }
  const upstream = request({ hostname: '127.0.0.1', port: nextPort, path: req.url, headers: req.headers });
  upstream.on('upgrade', (incoming, upstreamSocket, upstreamHead) => {
    socket.write(`HTTP/1.1 ${incoming.statusCode} Switching Protocols\r\n${Object.entries(incoming.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if (head.length) upstreamSocket.write(head); if (upstreamHead.length) socket.write(upstreamHead);
    socket.pipe(upstreamSocket).pipe(socket); socket.on('error', () => upstreamSocket.destroy()); upstreamSocket.on('error', () => socket.destroy());
  });
  upstream.on('error', () => socket.destroy()); upstream.end();
});
gateway.on('error', () => { console.error('Recovery gateway port is unavailable'); void stop(1); });
gateway.listen(webPort, '127.0.0.1', () => console.log(`Local recovery scope: ${channelId}. Open http://localhost:${webPort}/__recovery/start . Stop with Ctrl+C.`));
