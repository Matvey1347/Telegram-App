import express from 'express';
import {
  createServer,
  request,
  type Server,
  type RequestListener,
} from 'node:http';
import supertest from 'supertest';
import { createCrmRuntimeProxy } from './crm-runtime-proxy';

const servers: Server[] = [];
async function listen(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected a local TCP server');
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});

describe('CRM runtime owner proxy', () => {
  it.each([
    ['application/json', '{"text":"synthetic message","recent":true}'],
    [
      'multipart/form-data; boundary=synthetic',
      '--synthetic\r\nContent-Disposition: form-data; name="file"; filename="sample.bin"\r\nContent-Type: application/octet-stream\r\n\r\nraw\u0000bytes\r\n--synthetic--\r\n',
    ],
  ])(
    'forwards raw %s and workspace credentials to the owner before parsing',
    async (contentType, body) => {
      const upstream = await listen((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Connection', 'x-upstream-hop');
          res.setHeader('X-Upstream-Hop', 'strip-me');
          res.setHeader('Set-Cookie', ['owner=session; HttpOnly']);
          res.statusCode = 201;
          res.end(
            JSON.stringify({
              method: req.method,
              url: req.url,
              headers: req.headers,
              body: Buffer.concat(chunks).toString('base64'),
            }),
          );
        });
      });
      const app = express();
      app.use(createCrmRuntimeProxy(upstream));
      app.use(express.json());
      const result = await supertest(app)
        .post(
          '/api/telegram-crm/conversations/chat/messages?before=41&filter=a%20b',
        )
        .set('Authorization', 'Bearer synthetic-token')
        .set('Cookie', 'session=synthetic')
        .set('X-Workspace-Id', 'workspace-a')
        .set('Content-Type', contentType)
        .set('Connection', 'x-client-hop')
        .set('X-Client-Hop', 'strip-me')
        .send(body);
      expect(result.status).toBe(201);
      expect(result.body).toMatchObject({
        method: 'POST',
        url: '/api/telegram-crm/conversations/chat/messages?before=41&filter=a%20b',
        body: Buffer.from(body).toString('base64'),
        headers: {
          authorization: 'Bearer synthetic-token',
          cookie: 'session=synthetic',
          'x-workspace-id': 'workspace-a',
          'content-type': contentType,
          'x-crm-runtime-proxy-hop': '1',
        },
      });
      expect(
        (result.body as { headers: Record<string, unknown> }).headers,
      ).not.toHaveProperty('x-client-hop');
      expect(result.headers).not.toHaveProperty('x-upstream-hop');
      expect(result.headers['set-cookie']).toEqual(['owner=session; HttpOnly']);
    },
  );

  it('passes non-CRM and similarly named paths to local handlers', async () => {
    const called = jest.fn();
    const upstream = await listen((_req, res) => {
      called();
      res.end('upstream');
    });
    const app = express();
    app.use(createCrmRuntimeProxy(upstream));
    app.use((_req, res) => res.send('local'));
    for (const path of [
      '/api/health',
      '/api/telegram-crm-other',
      '/telegram-crm',
    ])
      expect((await supertest(app).get(path)).text).toBe('local');
    expect(called).not.toHaveBeenCalled();
  });

  it('fails closed with 502 when the owner disconnects instead of running a local handler', async () => {
    const upstream = await listen((req) => req.socket.destroy());
    const local = jest.fn();
    const app = express();
    app.use(createCrmRuntimeProxy(upstream));
    app.use((_req, res) => {
      local();
      res.end('local');
    });
    const result = await supertest(app).get('/api/telegram-crm');
    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({
      code: 'CRM_RUNTIME_PROXY_UNAVAILABLE',
    });
    expect(local).not.toHaveBeenCalled();
  });

  it('rejects a second proxy hop before forwarding credentials again', async () => {
    const called = jest.fn();
    const upstream = await listen((_req, res) => {
      called();
      res.end();
    });
    const app = express();
    app.use(createCrmRuntimeProxy(upstream));
    const result = await supertest(app)
      .get('/api/telegram-crm/events/stream')
      .set('X-Crm-Runtime-Proxy-Hop', '1');
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ code: 'CRM_RUNTIME_PROXY_LOOP' });
    expect(called).not.toHaveBeenCalled();
  });

  it('streams SSE immediately and closes the owner stream when the browser disconnects', async () => {
    let closed!: () => void;
    const upstreamClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const upstream = await listen((_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.once('close', closed);
      res.write('data: first-event\n\n');
    });
    const app = express();
    app.use(createCrmRuntimeProxy(upstream));
    const proxy = await listen(app);
    const first = await new Promise<string>((resolve, reject) => {
      const client = request(
        `${proxy}/api/telegram-crm/events/stream`,
        (res) => {
          expect(res.headers['content-type']).toBe('text/event-stream');
          res.once('data', (chunk: Buffer) => {
            resolve(chunk.toString());
            res.destroy();
          });
          res.on('error', () => undefined);
        },
      );
      client.once('error', reject);
      client.end();
    });
    expect(first).toBe('data: first-event\n\n');
    await upstreamClosed;
  });
});
