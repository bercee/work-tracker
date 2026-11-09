import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';

const productionDatabase = {
  NODE_ENV: 'production',
  DB_HOST: 'postgres',
  DB_PORT: '5432',
  DB_NAME: 'work_tracker',
  DB_USER: 'work_tracker',
  DB_PASSWORD: 's3cret',
};

describe('application configuration', () => {
  it('uses HTTP and development database defaults', () => {
    expect(loadConfig({})).toEqual({
      host: '0.0.0.0',
      port: 3000,
      database: {
        host: '127.0.0.1',
        port: 5433,
        name: 'work_tracker',
        user: 'work_tracker',
        password: 'work_tracker',
      },
    });
  });

  it('accepts valid overrides', () => {
    expect(loadConfig({ ...productionDatabase, HOST: '127.0.0.1', PORT: '4321' })).toEqual({
      host: '127.0.0.1',
      port: 4321,
      database: { host: 'postgres', port: 5432, name: 'work_tracker', user: 'work_tracker', password: 's3cret' },
    });
  });

  it.each(['', ' ', 'localhost\0invalid'])('rejects invalid host %s', (host) => {
    expect(() => loadConfig({ HOST: host })).toThrow('HOST must be a non-empty valid host');
  });

  it.each(['', '0', '-1', '3.5', ' 3000', '65536', 'not-a-port'])('rejects invalid port %s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow('PORT must be an integer from 1 through 65535');
  });
});

describe('database configuration', () => {
  it.each(['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'])('requires %s in production', (key) => {
    const environment: NodeJS.ProcessEnv = { ...productionDatabase };
    delete environment[key];

    expect(() => loadConfig(environment)).toThrow(`${key} must be set in production`);
  });

  it.each(['@', '/', 'p@ss/w:rd?#%', 'a@b/c@d/', ' padded ', 'üñí'])(
    'passes the password %j through unchanged',
    (password) => {
      expect(loadConfig({ ...productionDatabase, DB_PASSWORD: password }).database.password).toBe(password);
    },
  );

  it.each(['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'])('rejects an empty %s', (key) => {
    expect(() => loadConfig({ ...productionDatabase, [key]: '' })).toThrow(`${key} must be a non-empty valid value`);
  });

  it.each(['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'])('rejects a NUL byte in %s', (key) => {
    expect(() => loadConfig({ ...productionDatabase, [key]: 'a\0b' })).toThrow(
      `${key} must be a non-empty valid value`,
    );
  });

  it.each(['DB_HOST', 'DB_NAME', 'DB_USER'])('rejects a blank %s', (key) => {
    expect(() => loadConfig({ ...productionDatabase, [key]: '  ' })).toThrow(`${key} must be a non-empty valid value`);
  });

  it.each(['', '0', '-1', '5.5', ' 5432', '65536', 'postgres'])('rejects invalid DB_PORT %s', (port) => {
    expect(() => loadConfig({ ...productionDatabase, DB_PORT: port })).toThrow(
      'DB_PORT must be an integer from 1 through 65535',
    );
  });

  it('accepts the port range limits', () => {
    expect(loadConfig({ ...productionDatabase, DB_PORT: '1' }).database.port).toBe(1);
    expect(loadConfig({ ...productionDatabase, DB_PORT: '65535' }).database.port).toBe(65_535);
  });

  it('never exposes a connection URL', () => {
    const { database } = loadConfig({ ...productionDatabase, DB_PASSWORD: 'p@ss/word' });

    expect(Object.keys(database).sort()).toEqual(['host', 'name', 'password', 'port', 'user']);
  });
});
