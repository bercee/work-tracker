import { sql } from 'drizzle-orm';

import type { WorkdayDatabase } from '../../src/database/workdayDatabase.js';
import { PostgresWorkdayDatabase } from '../../src/database/postgresWorkdayDatabase.js';
import { applyMigrations } from '../../src/database/migrations.js';
import { createPostgresConnection } from '../../src/database/postgres.js';
import type { PostgresConnection } from '../../src/database/postgres.js';
import { startTestPostgres } from './testPostgres.js';
import type { TestPostgres } from './testPostgres.js';

export interface TestDatabase {
  database: WorkdayDatabase;
  connection: PostgresConnection;
  postgres: TestPostgres;
  reset(): Promise<void>;
  stop(): Promise<void>;
}

// One migrated PostgreSQL per test file; call reset() between tests to empty the table.
export async function startTestDatabase(): Promise<TestDatabase> {
  const postgres = await startTestPostgres();
  const connection = createPostgresConnection(postgres.config);
  try {
    await applyMigrations(connection.db);
  } catch (error: unknown) {
    await connection.close();
    await postgres.stop();
    throw error;
  }

  return {
    database: new PostgresWorkdayDatabase(connection.db),
    connection,
    postgres,
    async reset() {
      await connection.db.execute(sql`TRUNCATE workdays`);
    },
    async stop() {
      await connection.close();
      await postgres.stop();
    },
  };
}
