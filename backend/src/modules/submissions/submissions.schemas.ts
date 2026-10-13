import { z } from 'zod';

export const CreateSubmissionSchema = z
  .object({
    campaignId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid campaign id'),
    postUrl: z.string().trim().min(1, 'Post link is required').max(500),
  })
  .strict();

export type CreateSubmissionInput = z.infer<typeof CreateSubmissionSchema>;
