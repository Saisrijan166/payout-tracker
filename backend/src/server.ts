import { createApp } from './app';
import { env } from './config/env';
import { connectDb, disconnectDb } from './lib/db';
import { logger } from './lib/logger';
import { connectRedis, disconnectRedis } from './lib/redis';

async function main(): Promise<void> {
  await connectDb(env.MONGODB_URI);
  await connectRedis(env.REDIS_URL);

  const app = createApp();
  const server = app.listen(env.PORT, (error?: Error) => {
    if (error) {
      logger.fatal({ err: error }, 'Failed to bind port');
      process.exit(1);
    }
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'Shutting down');
    // Force exit if open connections keep the server alive for too long.
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      Promise.all([disconnectDb(), disconnectRedis()])
        .then(() => process.exit(0))
        .catch((err: unknown) => {
          logger.error({ err }, 'Error during shutdown');
          process.exit(1);
        });
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Failed to start API');
  process.exit(1);
});
