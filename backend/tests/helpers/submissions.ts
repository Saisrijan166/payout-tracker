import type { Express } from 'express';
import request from 'supertest';
import type { SubmissionDTO } from '../../src/modules/submissions/submissions.dto';
import { bearer } from './auth';

let counter = 0;

/** Submits a fresh, unique Instagram post to a campaign and returns the submission. */
export async function submitPostAs(
  app: Express,
  token: string,
  campaignId: string,
): Promise<SubmissionDTO> {
  counter += 1;
  const res = await request(app)
    .post('/api/submissions')
    .set('Authorization', bearer(token))
    .send({
      campaignId,
      postUrl: `https://www.instagram.com/p/TestPost${String(counter).padStart(4, '0')}/`,
    });
  if (res.status !== 201) {
    throw new Error(`submission failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return (res.body as { submission: SubmissionDTO }).submission;
}

export const patchViews = (app: Express, submissionId: string, views: unknown) =>
  request(app).patch(`/api/submissions/${submissionId}/views`).send({ views });
