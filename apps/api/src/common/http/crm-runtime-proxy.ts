import type { RequestHandler } from 'express';
import {
  request as httpRequest,
  type ClientRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
} from 'node:http';
import { request as httpsRequest } from 'node:https';

const HOP_HEADER = 'x-crm-runtime-proxy-hop';
const HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function endToEndHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const connectionHeaders = new Set(
    String(headers.connection ?? '')
      .toLowerCase()
      .split(',')
      .map((value) => value.trim()),
  );
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) =>
        value !== undefined &&
        !HOP_HEADERS.has(name) &&
        !connectionHeaders.has(name),
    ),
  );
}

/** Install before body parsers: one trusted owner handles CRM HTTP and SSE. */
export function createCrmRuntimeProxy(
  origin: string,
  options: { localReactionAssets?: boolean } = {},
): RequestHandler {
  const target = new URL(origin);
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  )
    throw new Error('CRM_RUNTIME_PROXY_ORIGIN_INVALID');
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
  return (req, res, next) => {
    const path = req.originalUrl || req.url;
    if (!/^\/api\/telegram-crm(?:\/|\?|$)/.test(path)) return next();
    if (
      options.localReactionAssets &&
      req.method === 'POST' &&
      /^\/api\/telegram-crm\/conversations\/[^/?]+\/reaction-assets(?:\?|$)/.test(
        path,
      )
    )
      return next();
    if (req.headers[HOP_HEADER] !== undefined) {
      res.status(503).json({
        statusCode: 503,
        code: 'CRM_RUNTIME_PROXY_LOOP',
        message: 'CRM runtime proxy routing loop detected.',
      });
      return;
    }
    let upstream: ClientRequest | undefined;
    let response: IncomingMessage | undefined;
    const cleanup = () => {
      req.off('aborted', cancel);
      req.off('error', cancel);
      res.off('close', onClose);
    };
    const cancel = () => {
      response?.destroy();
      upstream?.destroy();
      cleanup();
    };
    const onClose = () => {
      if (!res.writableEnded) cancel();
      else cleanup();
    };
    const fail = () => {
      if (res.destroyed) return cleanup();
      if (res.headersSent) res.destroy();
      else {
        res.removeHeader('content-length');
        res.removeHeader('content-encoding');
        res.type('application/json');
        res.status(502).json({
          statusCode: 502,
          code: 'CRM_RUNTIME_PROXY_UNAVAILABLE',
          message: 'CRM runtime upstream is unavailable.',
        });
      }
    };
    req.once('aborted', cancel);
    req.once('error', cancel);
    res.once('close', onClose);
    try {
      upstream = request(
        target,
        {
          path,
          method: req.method,
          headers: { ...endToEndHeaders(req.headers), [HOP_HEADER]: '1' },
        },
        (incoming) => {
          response = incoming;
          if (res.destroyed) return cancel();
          res.statusCode = incoming.statusCode ?? 502;
          for (const [name, value] of Object.entries(
            endToEndHeaders(incoming.headers),
          ))
            if (value !== undefined) res.setHeader(name, value);
          incoming.once('error', fail);
          incoming.once('aborted', fail);
          incoming.pipe(res);
        },
      );
      upstream.once('error', fail);
      req.pipe(upstream);
    } catch {
      upstream?.destroy();
      fail();
    }
  };
}
