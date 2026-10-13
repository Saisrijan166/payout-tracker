import { Schema, model, type Types } from 'mongoose';

/** One view-count reading, kept so spikes can be detected and payouts audited. */
export interface ViewReading {
  views: number;
  at: Date;
  /** Rupees paid as a result of this reading. */
  paid: number;
}

export interface SubmissionAttrs {
  campaign: Types.ObjectId;
  creator: Types.ObjectId;
  /** The link exactly as the creator submitted it. */
  postUrl: string;
  /** Canonical post identity, e.g. `instagram:C8xYz12AbC`. Unique across all campaigns. */
  postKey: string;
  /** Latest view count. Never decreases. */
  views: number;
  /** Payout of the highest milestone crossed at `views`. */
  entitledAmount: number;
  /** Rupees actually paid. Never more than entitledAmount. */
  paidAmount: number;
  flagged: boolean;
  flagReason?: string;
  flaggedAt?: Date;
  /** Most recent readings, oldest first, capped at VIEW_HISTORY_LIMIT. */
  viewHistory: ViewReading[];
  createdAt: Date;
  updatedAt: Date;
}

export type SubmissionRecord = SubmissionAttrs & { _id: Types.ObjectId };

export const VIEW_HISTORY_LIMIT = 20;

const nonNegativeWhole = () => ({
  type: Number,
  default: 0,
  min: 0,
  validate: {
    validator: (value: number) => Number.isSafeInteger(value),
    message: '{PATH} must be a whole number',
  },
});

const viewReadingSchema = new Schema<ViewReading>(
  {
    views: { type: Number, required: true, min: 0 },
    at: { type: Date, required: true },
    paid: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const submissionSchema = new Schema<SubmissionAttrs>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    postUrl: { type: String, required: true, trim: true, maxlength: 500 },
    postKey: { type: String, required: true, unique: true },
    views: nonNegativeWhole(),
    entitledAmount: nonNegativeWhole(),
    paidAmount: nonNegativeWhole(),
    flagged: { type: Boolean, default: false },
    flagReason: { type: String },
    flaggedAt: { type: Date },
    viewHistory: { type: [viewReadingSchema], default: [] },
  },
  { timestamps: true },
);

submissionSchema.index({ creator: 1, createdAt: -1 }); // a creator's submissions
submissionSchema.index({ campaign: 1, createdAt: -1 }); // a campaign's submissions

export const SubmissionModel = model<SubmissionAttrs>('Submission', submissionSchema);
