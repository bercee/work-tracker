import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations } from '../../src/database/migrations.js';
import { createPostgresConnection } from '../../src/database/postgres.js';
import type { PostgresConnection } from '../../src/database/postgres.js';
import type { TestPostgres } from '../helpers/testPostgres.js';
import { startTestPostgres } from '../helpers/testPostgres.js';

const CHECK_VIOLATION = '23514';

describe('workdays table constraints', () => {
  let postgres: TestPostgres;
  let connection: PostgresConnection;
  let client: pg.Client;

  beforeAll(async () => {
    postgres = await startTestPostgres();
    connection = createPostgresConnection(postgres.config);
    await applyMigrations(connection.db);
    client = new pg.Client({
      host: postgres.config.host,
      port: postgres.config.port,
      database: postgres.config.name,
      user: postgres.config.user,
      password: postgres.config.password,
    });
    await client.connect();
  }, 60_000);

  beforeEach(async () => {
    await client.query('TRUNCATE workdays');
  });

  afterAll(async () => {
    await client.end();
    await connection.close();
    await postgres.stop();
  });

  const insert = (clockIn: string, clockOut: string | null, lunchMinutes: number | null) =>
    client.query(`INSERT INTO workdays (date, clock_in, clock_out, lunch_minutes) VALUES ('2026-11-09', $1, $2, $3)`, [
      clockIn,
      clockOut,
      lunchMinutes,
    ]);

  async function expectConstraint(
    clockIn: string,
    clockOut: string | null,
    lunchMinutes: number | null,
    constraint: string,
  ): Promise<void> {
    await expect(insert(clockIn, clockOut, lunchMinutes)).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint,
    });
  }

  it('accepts a valid Workday and defaults Half day to false', async () => {
    await insert('08:00', '17:00', 60);

    const result = await client.query(
      'SELECT date::text AS date, clock_in::text AS clock_in, clock_out::text AS clock_out, lunch_minutes, half_day FROM workdays',
    );
    expect(result.rows).toEqual([
      { date: '2026-11-09', clock_in: '08:00:00', clock_out: '17:00:00', lunch_minutes: 60, half_day: false },
    ]);
  });

  it('accepts an Incomplete Workday with only a Clock-in', async () => {
    await insert('08:00', null, null);
    const result = await client.query('SELECT count(*)::int AS count FROM workdays');
    expect(result.rows[0]).toEqual({ count: 1 });
  });

  it('rejects a Clock-out that is not after the Clock-in', async () => {
    await expectConstraint('08:00', '08:00', null, 'workdays_clock_out_after_clock_in');
    await expectConstraint('09:00', '08:00', null, 'workdays_clock_out_after_clock_in');
  });

  it.each([-1, 1440])('rejects a Lunch break of %i minutes', async (minutes) => {
    await expectConstraint('08:00', null, minutes, 'workdays_lunch_minutes_range');
  });

  it('accepts the Lunch break range limits when no Clock-out is set', async () => {
    await insert('08:00', null, 0);
    await client.query('TRUNCATE workdays');
    await insert('08:00', null, 1439);
  });

  it('rejects a Lunch break that is not shorter than the span', async () => {
    await expectConstraint('08:00', '09:00', 60, 'workdays_lunch_shorter_than_span');
    await expectConstraint('08:00', '09:00', 61, 'workdays_lunch_shorter_than_span');
  });

  it('accepts a Lunch break one minute shorter than the span', async () => {
    await insert('08:00', '09:00', 59);
  });
});
