import path from 'node:path';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import type { DatabaseConfig } from '../config.js';
import { createPostgresConnection } from './postgres.js';
import type { PostgresConnection } from './postgres.js';

// The folder sits next to dist/ in the image (and next to src/ in a checkout).
export const migrationsFolder = path.join(import.meta.dirname, '../../drizzle');

export function applyMigrations(db: PostgresConnection['db'], folder = migrationsFolder): Promise<void> {
  return migrate(db, { migrationsFolder: folder });
}

export async function runMigrations(config: DatabaseConfig, folder = migrationsFolder): Promise<void> {
  const connection = createPostgresConnection(config);
  try {
    await applyMigrations(connection.db, folder);
  } finally {
    await connection.close();
  }
}
