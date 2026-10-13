// Mirrors the backend DTOs (see IMPLEMENTATION_PLAN.md section 5).

export type Role = 'brand' | 'creator';
export type Platform = 'instagram' | 'youtube';
export type CampaignStatus = 'live' | 'exhausted';

export interface Milestone {
  views: number;
  payout: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Campaign {
  id: string;
  brandId: string;
  name: string;
  platform: Platform;
  totalBudget: number;
  spent: number;
  remaining: number;
  milestones: Milestone[];
  status: CampaignStatus;
  createdAt: string;
}

export interface BrandCampaign extends Campaign {
  submissionCount: number;
  flaggedCount: number;
}

export interface Submission {
  id: string;
  campaignId: string;
  campaign?: { id: string; name: string; platform: Platform };
  creatorId: string;
  creator?: { id: string; name: string };
  postUrl: string;
  views: number;
  entitledAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  flagged: boolean;
  flagReason?: string;
  lastViewsAt: string;
  createdAt: string;
}

export interface CreatorEarnings {
  summary: {
    totalEarned: number;
    totalEntitled: number;
    totalUnpaid: number;
    submissionCount: number;
  };
  submissions: Submission[];
}

export interface ViewUpdateResult {
  submission: Submission;
  payout: { entitled: number; paidNow: number; paidTotal: number; unpaid: number };
  campaign: { id: string; spent: number; remaining: number; status: CampaignStatus };
}

export interface ApiErrorDetail {
  path: string;
  message: string;
}
