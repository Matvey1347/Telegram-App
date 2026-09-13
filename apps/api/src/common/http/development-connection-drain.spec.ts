import { EventEmitter } from 'node:events';
import { installDevelopmentConnectionDrain } from './development-connection-drain';

describe('installDevelopmentConnectionDrain', () => {
  it('closes long-lived HTTP connections before a development restart', () => {
    const signals = new EventEmitter();
    const server = new EventEmitter() as EventEmitter & {
      closeAllConnections: jest.Mock;
    };
    server.closeAllConnections = jest.fn();
    const socket = new EventEmitter() as EventEmitter & {
      destroy: jest.Mock;
    };
    socket.destroy = jest.fn();
    installDevelopmentConnectionDrain(server as never, 'development', signals);
    server.emit('connection', socket);

    signals.emit('SIGTERM');

    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('bounds a development shutdown when an async lifecycle hook hangs', () => {
    jest.useFakeTimers();
    const signals = new EventEmitter();
    const server = new EventEmitter() as EventEmitter & {
      closeAllConnections: jest.Mock;
    };
    server.closeAllConnections = jest.fn();
    const forceExit = jest.fn();
    installDevelopmentConnectionDrain(
      server as never,
      'development',
      signals,
      forceExit,
    );

    signals.emit('SIGTERM');
    jest.advanceTimersByTime(1_499);
    expect(forceExit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(forceExit).toHaveBeenCalledWith(0);
    jest.useRealTimers();
  });

  it('keeps production shutdown graceful', () => {
    const signals = new EventEmitter();
    const server = {
      closeAllConnections: jest.fn(),
      on: jest.fn(),
    };
    installDevelopmentConnectionDrain(server as never, 'production', signals);

    signals.emit('SIGTERM');

    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });

  it('does not force-close connections in named non-development environments', () => {
    const signals = new EventEmitter();
    const server = {
      closeAllConnections: jest.fn(),
      on: jest.fn(),
    };
    installDevelopmentConnectionDrain(server as never, 'staging', signals);

    signals.emit('SIGTERM');

    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });
});
