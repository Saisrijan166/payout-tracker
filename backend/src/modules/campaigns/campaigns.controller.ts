import type { RequestHandler } from 'express';
import { parseObjectId } from '../../lib/errors';
import { getAuthUser } from '../../middleware/auth';
import { listCampaignSubmissions } from '../submissions/submissions.service';
import { toCampaignDTO } from './campaigns.dto';
import { CreateCampaignSchema } from './campaigns.schemas';
import {
  createCampaign,
  getOwnedCampaign,
  listBrandCampaigns,
  listLiveCampaigns,
} from './campaigns.service';

export const createCampaignHandler: RequestHandler = async (req, res) => {
  const input = CreateCampaignSchema.parse(req.body);
  const campaign = await createCampaign(getAuthUser(req).id, input);
  res.status(201).json({ campaign });
};

export const listLiveCampaignsHandler: RequestHandler = async (_req, res) => {
  res.json({ campaigns: await listLiveCampaigns() });
};

export const listMyCampaignsHandler: RequestHandler = async (req, res) => {
  res.json({ campaigns: await listBrandCampaigns(getAuthUser(req).id) });
};

export const getCampaignHandler: RequestHandler = async (req, res) => {
  const campaignId = parseObjectId(req.params.id, 'campaign id');
  const campaign = await getOwnedCampaign(getAuthUser(req).id, campaignId);
  const submissions = await listCampaignSubmissions(campaignId);
  res.json({ campaign: toCampaignDTO(campaign), submissions });
};
