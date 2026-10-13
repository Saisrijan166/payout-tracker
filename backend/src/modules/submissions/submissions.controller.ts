import type { RequestHandler } from 'express';
import { parseObjectId } from '../../lib/errors';
import { getAuthUser } from '../../middleware/auth';
import { CreateSubmissionSchema, UpdateViewsSchema } from './submissions.schemas';
import { createSubmission, listCreatorSubmissions } from './submissions.service';
import { applyViewUpdate } from './views.service';

export const createSubmissionHandler: RequestHandler = async (req, res) => {
  const input = CreateSubmissionSchema.parse(req.body);
  const submission = await createSubmission(getAuthUser(req).id, input);
  res.status(201).json({ submission });
};

export const listMySubmissionsHandler: RequestHandler = async (req, res) => {
  res.json(await listCreatorSubmissions(getAuthUser(req).id));
};

export const updateViewsHandler: RequestHandler = async (req, res) => {
  const submissionId = parseObjectId(req.params.id, 'submission id');
  const { views } = UpdateViewsSchema.parse(req.body);
  res.json(await applyViewUpdate(submissionId, views));
};
