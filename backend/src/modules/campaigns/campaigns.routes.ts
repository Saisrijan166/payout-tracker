import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth';
import {
  createCampaignHandler,
  getCampaignHandler,
  listLiveCampaignsHandler,
  listMyCampaignsHandler,
} from './campaigns.controller';

export const campaignsRouter = Router();

campaignsRouter.use(requireAuth);

campaignsRouter.post('/', requireRole('brand'), createCampaignHandler);
campaignsRouter.get('/', listLiveCampaignsHandler);
campaignsRouter.get('/mine', requireRole('brand'), listMyCampaignsHandler);
campaignsRouter.get('/:id', requireRole('brand'), getCampaignHandler);
