import { Schema, model, type Types } from 'mongoose';
import type { Milestone } from '../domain/milestones';
import { PLATFORMS, type Platform } from '../domain/platform';

export const CAMPAIGN_STATUSES = ['live', 'exhausted'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface CampaignAttrs {
  brand: Types.ObjectId;
  name: string;
  platform: Platform;
  /** Whole rupees. Fixed at creation. */
  totalBudget: number;
  /** Whole rupees paid out so far. Only the payout service changes it, atomically. */
  spent: number;
  /** Sorted ascending by views. Fixed at creation so earned entitlements never change. */
  milestones: Milestone[];
  /** `exhausted` exactly when spent === totalBudget. */
  status: CampaignStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type CampaignRecord = CampaignAttrs & { _id: Types.ObjectId };

const wholeNumber = {
  validator: (value: number) => Number.isSafeInteger(value),
  message: '{PATH} must be a whole number',
};

const milestoneSchema = new Schema<Milestone>(
  {
    views: { type: Number, required: true, min: 1, validate: wholeNumber },
    payout: { type: Number, required: true, min: 1, validate: wholeNumber },
  },
  { _id: false },
);

const campaignSchema = new Schema<CampaignAttrs>(
  {
    brand: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    platform: { type: String, enum: PLATFORMS, required: true },
    totalBudget: { type: Number, required: true, min: 1, immutable: true, validate: wholeNumber },
    spent: { type: Number, default: 0, min: 0, validate: wholeNumber },
    milestones: { type: [milestoneSchema], required: true, immutable: true },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'live' },
  },
  { timestamps: true },
);

campaignSchema.index({ status: 1, createdAt: -1 }); // live campaign list
campaignSchema.index({ brand: 1, createdAt: -1 }); // a brand's own campaigns

export const CampaignModel = model<CampaignAttrs>('Campaign', campaignSchema);
