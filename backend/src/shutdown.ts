export interface ClosableServer {
  close(callback: (error?: Error) => void): void;
}

export interface Closable {
  close(): Promise<void>;
}

export interface ShutdownOptions {
  exit?: (code: number) => void;
  logger?: Pick<Console, 'error'>;
}

export type Shutdown = (signal: NodeJS.Signals) => Promise<void>;

export function createShutdownCoordinator(
  server: ClosableServer,
  database: Closable,
  options: ShutdownOptions = {},
): Shutdown {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const logger = options.logger ?? console;
  let shutdown: Promise<void> | undefined;

  return (signal) => {
    shutdown ??= (async () => {
      let code = 0;
      try {
        await closeServer(server);
      } catch (error: unknown) {
        logger.error(`Failed to shut down after ${signal}`, error);
        code = 1;
      }
      try {
        await database.close();
      } catch (error: unknown) {
        logger.error('Failed to close database during shutdown', error);
        code = 1;
      }
      exit(code);
    })();

    return shutdown;
  };
}

function closeServer(server: ClosableServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
