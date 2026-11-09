export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
}

export interface AppConfig {
  host: string;
  port: number;
  database: DatabaseConfig;
}

// Must match deploy/compose.dev.yml. Production has no defaults.
const developmentDatabase = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '5433',
  DB_NAME: 'work_tracker',
  DB_USER: 'work_tracker',
  DB_PASSWORD: 'work_tracker',
} as const;

type DatabaseKey = keyof typeof developmentDatabase;

function parsePort(text: string, name: string): number {
  const port = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer from 1 through 65535`);
  }

  return port;
}

function readDatabaseValue(environment: NodeJS.ProcessEnv, key: DatabaseKey): string {
  const value = environment[key] ?? (environment.NODE_ENV === 'production' ? undefined : developmentDatabase[key]);
  if (value === undefined) {
    throw new Error(`${key} must be set in production`);
  }

  return value;
}

// Passwords are kept verbatim, so only an empty one is rejected; the other values must not be blank.
function readDatabaseText(environment: NodeJS.ProcessEnv, key: Exclude<DatabaseKey, 'DB_PORT'>): string {
  const value = readDatabaseValue(environment, key);
  const isBlank = key === 'DB_PASSWORD' ? value === '' : value.trim() === '';
  if (isBlank || value.includes('\0')) {
    throw new Error(`${key} must be a non-empty valid value`);
  }

  return value;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = environment.HOST ?? '0.0.0.0';
  if (host.trim() === '' || host.includes('\0')) {
    throw new Error('HOST must be a non-empty valid host');
  }

  return {
    host,
    port: parsePort(environment.PORT ?? '3000', 'PORT'),
    database: {
      host: readDatabaseText(environment, 'DB_HOST'),
      port: parsePort(readDatabaseValue(environment, 'DB_PORT'), 'DB_PORT'),
      name: readDatabaseText(environment, 'DB_NAME'),
      user: readDatabaseText(environment, 'DB_USER'),
      password: readDatabaseText(environment, 'DB_PASSWORD'),
    },
  };
}
