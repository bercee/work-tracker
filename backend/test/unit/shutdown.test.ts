import { describe, expect, it, vi } from 'vitest';

import { createShutdownCoordinator, type ClosableServer } from '../../src/shutdown.js';

describe('shutdown coordinator', () => {
  it('closes the server before the database and exits successfully only once', async () => {
    const events: string[] = [];
    const server: ClosableServer = {
      close(callback) {
        events.push('server');
        callback();
      },
    };
    const database = {
      close: vi.fn(() => {
        events.push('database');
        return Promise.resolve();
      }),
    };
    const exit = vi.fn((code: number) => events.push(`exit:${code}`));
    const shutdown = createShutdownCoordinator(server, database, { exit });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(events).toEqual(['server', 'database', 'exit:0']);
    expect(database.close).toHaveBeenCalledOnce();
  });

  it('closes the database and exits non-zero when server shutdown fails', async () => {
    const failure = new Error('close failed');
    const server: ClosableServer = { close: (callback) => callback(failure) };
    const database = { close: vi.fn(() => Promise.resolve()) };
    const exit = vi.fn();
    const logger = { error: vi.fn() };

    await createShutdownCoordinator(server, database, { exit, logger })('SIGTERM');

    expect(database.close).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith('Failed to shut down after SIGTERM', failure);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('reports a database close failure during failed shutdown', async () => {
    const serverFailure = new Error('server close failed');
    const databaseFailure = new Error('database close failed');
    const server: ClosableServer = { close: (callback) => callback(serverFailure) };
    const database = {
      close: () => Promise.reject(databaseFailure),
    };
    const exit = vi.fn();
    const logger = { error: vi.fn() };

    await createShutdownCoordinator(server, database, { exit, logger })('SIGINT');

    expect(logger.error).toHaveBeenCalledWith('Failed to close database during shutdown', databaseFailure);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
