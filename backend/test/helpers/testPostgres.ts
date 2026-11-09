import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';

import type { DatabaseConfig } from '../../src/config.js';

export interface TestPostgres {
  config: DatabaseConfig;
  stop(): Promise<void>;
}

// Postgres refuses to run as root, so this only works on a non-root user (as in CI and local dev).
export async function startTestPostgres(): Promise<TestPostgres> {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-tracker-pg-'));
  const config: DatabaseConfig = {
    host: '127.0.0.1',
    port: await getFreePort(),
    name: 'postgres',
    user: 'work_tracker',
    password: 'p@ss/word',
  };
  const server = new EmbeddedPostgres({
    databaseDir: path.join(directory, 'data'),
    port: config.port,
    user: config.user,
    password: config.password,
    persistent: false,
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'fsync=off'],
    onLog: () => undefined,
    onError: () => undefined,
  });

  try {
    await server.initialise();
    await server.start();
  } catch (error: unknown) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }

  let stopped = false;
  return {
    config,
    async stop() {
      if (!stopped) {
        stopped = true;
        try {
          await server.stop();
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      }
    },
  };
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address !== null && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('Could not determine a free port'));
        }
      });
    });
  });
}
