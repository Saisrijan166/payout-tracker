import { Redis } from 'ioredis';
import { logger } from './logger';

let client: Redis | null = null;

/**
 * Connects to Redis if a URL is configured. Redis is an optional cache: if it is
 * missing or down the API keeps working against MongoDB, and the client keeps
 * reconnecting in the background.
 */
export async function connectRedis(url: string | undefined): Promise<void> {
  if (!url) {
    logger.info('REDIS_URL not set: campaign list cache disabled');
    return;
  }

  const redis = new Redis(url, {
    lazyConnect: true,
    // Fail fast while disconnected so requests fall back to MongoDB instead of queueing.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
  });

  let warned = false;
  redis.on('ready', () => {
    warned = false;
    logger.info('Redis ready');
  });
  redis.on('error', (err: Error) => {
    if (warned) return; // one warning per outage, not one per reconnect attempt
    warned = true;
    logger.warn(
      { err: err.message },
      'Redis unavailable: serving without cache until it reconnects',
    );
  });

  client = redis;
  try {
    await redis.connect();
  } catch {
    // Already logged by the error handler; reconnection continues in the background.
  }
}

/** The client, but only while it is connected and usable. */
export function getRedis(): Redis | null {
  return client?.status === 'ready' ? client : null;
}

export function redisStatus(): 'up' | 'down' | 'disabled' {
  if (!client) return 'disabled';
  return client.status === 'ready' ? 'up' : 'down';
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  const redis = client;
  client = null;
  if (redis.status === 'ready') {
    await redis.quit();
  } else {
    redis.disconnect();
  }
}
