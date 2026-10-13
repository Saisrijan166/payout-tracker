import { z } from 'zod';

export const CreateSubmissionSchema = z
  .object({
    campaignId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid campaign id'),
    postUrl: z.string().trim().min(1, 'Post link is required').max(500),
  })
  .strict();

export type CreateSubmissionInput = z.infer<typeof CreateSubmissionSchema>;

export const UpdateViewsSchema = z
  .object({
    views: z
      .number({ required_error: 'views is required', invalid_type_error: 'views must be a number' })
      .int('views must be a whole number')
      .nonnegative('views cannot be negative')
      .safe(),
  })
  .strict();

export type UpdateViewsInput = z.infer<typeof UpdateViewsSchema>;
