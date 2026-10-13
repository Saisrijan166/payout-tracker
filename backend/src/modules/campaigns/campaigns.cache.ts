import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { getRedis } from '../../lib/redis';
import type { CampaignDTO } from './campaigns.dto';

/** Bump the version suffix if the cached DTO shape changes. */
const LIVE_CAMPAIGNS_KEY = 'campaigns:live:v1';

// Cache-aside helpers. Every Redis failure is logged and treated as a miss, so
// the caller falls back to MongoDB. Staleness is bounded by the TTL.

export async function readLiveCampaigns(): Promise<CampaignDTO[] | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(LIVE_CAMPAIGNS_KEY);
    return raw ? (JSON.parse(raw) as CampaignDTO[]) : null;
  } catch (err) {
    logger.warn({ err }, 'Campaign cache read failed');
    return null;
  }
}

export async function writeLiveCampaigns(campaigns: CampaignDTO[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(
      LIVE_CAMPAIGNS_KEY,
      JSON.stringify(campaigns),
      'EX',
      env.CAMPAIGN_CACHE_TTL_SECONDS,
    );
  } catch (err) {
    logger.warn({ err }, 'Campaign cache write failed');
  }
}

/** Called when the live list changes: a campaign is created or runs out of budget. */
export async function invalidateLiveCampaigns(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(LIVE_CAMPAIGNS_KEY);
  } catch (err) {
    logger.warn({ err }, 'Campaign cache invalidation failed');
  }
}

export function isCacheEnabled(): boolean {
  return getRedis() !== null;
}
