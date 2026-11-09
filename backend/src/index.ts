import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPostgresConnection } from './database/postgres.js';
import { PostgresWorkdayDatabase } from './database/postgresWorkdayDatabase.js';
import { createShutdownCoordinator } from './shutdown.js';

try {
  const config = loadConfig();
  const postgres = createPostgresConnection(config.database);
  const app = createApp(new PostgresWorkdayDatabase(postgres.db), postgres.checkHealth);
  const server = app.listen(config.port, config.host);
  server.once('listening', () => {
    console.log(`Work Tracker backend listening on http://${config.host}:${config.port}`);
    postgres.checkHealth().catch((error: unknown) => {
      console.error('DATABASE UNAVAILABLE: the backend keeps running and reconnects once it is back.', error);
    });
  });
  server.once('error', (error: Error) => {
    console.error('Failed to start Work Tracker backend', error);
    process.exit(1);
  });
  const shutdown = createShutdownCoordinator(server, postgres);

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
} catch (error: unknown) {
  console.error('Failed to start Work Tracker backend', error);
  process.exitCode = 1;
}
