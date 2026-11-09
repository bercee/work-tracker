import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createPostgresConnection } from '../../src/database/postgres.js';
import type { PostgresConnection } from '../../src/database/postgres.js';
import { PostgresWorkdayDatabase } from '../../src/database/postgresWorkdayDatabase.js';
import type { TestPostgres } from '../helpers/testPostgres.js';
import { startTestPostgres } from '../helpers/testPostgres.js';

describe('GET /api/health against PostgreSQL', () => {
  let postgres: TestPostgres;
  let connection: PostgresConnection;

  beforeAll(async () => {
    postgres = await startTestPostgres();
    connection = createPostgresConnection(postgres.config, { healthTimeoutMs: 1_000 });
  }, 60_000);

  afterAll(async () => {
    await connection.close();
    await postgres.stop();
  });

  it('passes while the database is up and fails once it is stopped', async () => {
    const app = createApp(new PostgresWorkdayDatabase(connection.db), connection.checkHealth, {
      error: () => undefined,
    });

    const up = await request(app).get('/api/health');
    expect(up.status).toBe(200);
    expect(up.headers['content-type']).toMatch(/^application\/json/);
    expect(up.headers['x-powered-by']).toBeUndefined();
    expect(up.body).toEqual({ status: 'ok' });

    await postgres.stop();

    const down = await request(app).get('/api/health');
    expect(down.status).toBe(503);
    expect(down.body).toEqual({
      status: 'unavailable',
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable' },
    });

    const days = await request(app).get('/api/days');
    expect(days.status).toBe(503);
    expect(days.body).toEqual({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable' },
    });
  }, 60_000);
});
