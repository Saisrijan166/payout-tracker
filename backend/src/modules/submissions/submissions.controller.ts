import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middleware/auth';
import { CreateSubmissionSchema } from './submissions.schemas';
import { createSubmission, listCreatorSubmissions } from './submissions.service';

export const createSubmissionHandler: RequestHandler = async (req, res) => {
  const input = CreateSubmissionSchema.parse(req.body);
  const submission = await createSubmission(getAuthUser(req).id, input);
  res.status(201).json({ submission });
};

export const listMySubmissionsHandler: RequestHandler = async (req, res) => {
  res.json(await listCreatorSubmissions(getAuthUser(req).id));
};
