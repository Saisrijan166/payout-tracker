import { z } from 'zod';
import { PLATFORMS } from '../../domain/platform';

// Shape only. Ladder rules (sorting, increasing payouts, budget fit) are checked by
// parseMilestoneLadder so they can be reported together as INVALID_MILESTONES.
const MilestoneInput = z
  .object({
    views: z.number({ invalid_type_error: 'views must be a number' }),
    payout: z.number({ invalid_type_error: 'payout must be a number' }),
  })
  .strict();

export const CreateCampaignSchema = z
  .object({
    name: z.string().trim().min(3, 'Name must be at least 3 characters').max(100),
    platform: z.enum(PLATFORMS),
    totalBudget: z
      .number()
      .int('Budget must be a whole number of rupees')
      .positive('Budget must be greater than zero')
      .safe(),
    milestones: z.array(MilestoneInput),
  })
  .strict();

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
