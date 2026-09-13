import type { Server } from 'node:http';
import type { Socket } from 'node:net';

type DrainableServer = Pick<Server, 'closeAllConnections' | 'on'>;
type SignalTarget = {
  prependOnceListener(signal: NodeJS.Signals, listener: () => void): unknown;
};

// Keep editor saves responsive even when an integration shutdown hook stalls.
const DEVELOPMENT_RESTART_GRACE_MS = 1_500;

/**
 * Nest's watch restart waits for the previous process to exit. Development
 * SSE/long-poll requests otherwise keep Node's HTTP server closing forever
 * after its listening socket is gone, leaving the local API port unavailable.
 */
export function installDevelopmentConnectionDrain(
  server: DrainableServer,
  environment: string | undefined,
  signalTarget: SignalTarget = process,
  forceExit: (code: number) => void = (code) => process.exit(code),
) {
  // Nest CLI leaves NODE_ENV unset during the normal local-watch runtime.
  // Named non-development environments retain graceful shutdown semantics.
  if (environment !== undefined && environment !== 'development') return;
  // Keep upgraded and streaming clients visible to the restart drain.
  const sockets = new Set<Socket>();
  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  let draining = false;
  const drain = () => {
    if (draining) return;
    draining = true;
    server.closeAllConnections();
    // Node deliberately excludes upgraded connections from
    // closeAllConnections(); track sockets as well so SSE/WebSocket clients
    // cannot block the development watcher.
    for (const socket of sockets) socket.destroy();
    const forcedExit = setTimeout(
      () => forceExit(0),
      DEVELOPMENT_RESTART_GRACE_MS,
    );
    forcedExit.unref?.();
  };
  signalTarget.prependOnceListener('SIGTERM', drain);
  signalTarget.prependOnceListener('SIGINT', drain);
}
