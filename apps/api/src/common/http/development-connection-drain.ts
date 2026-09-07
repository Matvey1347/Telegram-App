import type { Server } from 'node:http';
import type { Socket } from 'node:net';

type DrainableServer = Pick<Server, 'closeAllConnections' | 'on'>;
type SignalTarget = {
  prependOnceListener(signal: NodeJS.Signals, listener: () => void): unknown;
};

/**
 * Nest's watch restart waits for the previous process to exit. Development
 * SSE/long-poll requests otherwise keep Node's HTTP server closing forever
 * after its listening socket is gone, leaving the local API port unavailable.
 */
export function installDevelopmentConnectionDrain(
  server: DrainableServer,
  environment: string | undefined,
  signalTarget: SignalTarget = process,
) {
  // Nest CLI does not set NODE_ENV by default; an undefined value is the
  // normal local-watch runtime. Named non-development environments retain
  // graceful shutdown semantics.
  if (environment !== undefined && environment !== 'development') return;
  // Keep upgraded and streaming clients visible to the restart drain.
  const sockets = new Set<Socket>();
  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  const drain = () => {
    server.closeAllConnections();
    // Node deliberately excludes upgraded connections from
    // closeAllConnections(); track sockets as well so SSE/WebSocket clients
    // cannot block the development watcher.
    for (const socket of sockets) socket.destroy();
  };
  signalTarget.prependOnceListener('SIGTERM', drain);
  signalTarget.prependOnceListener('SIGINT', drain);
}
