import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../../src/database/migrations.js';
import type { TestPostgres } from '../helpers/testPostgres.js';
import { startTestPostgres } from '../helpers/testPostgres.js';

function writeMigrationFolder(directory: string, sql: string): string {
  mkdirSync(path.join(directory, 'meta'), { recursive: true });
  writeFileSync(path.join(directory, '0000_broken.sql'), sql);
  writeFileSync(
    path.join(directory, 'meta/_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'postgresql',
      entries: [{ idx: 0, version: '7', when: 1_700_000_000_000, tag: '0000_broken', breakpoints: true }],
    }),
  );
  return directory;
}

describe('runMigrations', () => {
  let postgres: TestPostgres;
  let scratch: string;

  beforeAll(async () => {
    postgres = await startTestPostgres();
    scratch = mkdtempSync(path.join(tmpdir(), 'work-tracker-migrations-'));
  }, 60_000);

  afterAll(async () => {
    rmSync(scratch, { recursive: true, force: true });
    await postgres.stop();
  });

  async function tableNames(): Promise<string[]> {
    const client = new pg.Client({ ...postgres.config, database: postgres.config.name });
    await client.connect();
    try {
      const result = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      );
      return result.rows.map((row) => row.table_name);
    } finally {
      await client.end();
    }
  }

  it('rejects when a migration fails and leaves no partial schema behind', async () => {
    const folder = writeMigrationFolder(
      path.join(scratch, 'broken'),
      'CREATE TABLE half_done (id integer);\n--> statement-breakpoint\nSELECT * FROM does_not_exist;',
    );

    await expect(runMigrations(postgres.config, folder)).rejects.toThrow();
    expect(await tableNames()).not.toContain('half_done');
  });

  it('migrates an empty database, and applying again is a no-op', async () => {
    await runMigrations(postgres.config);
    await runMigrations(postgres.config);

    expect(await tableNames()).toEqual(expect.arrayContaining(['workdays']));
  });
});
