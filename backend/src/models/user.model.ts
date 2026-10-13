import { Schema, model, type Types } from 'mongoose';

export const ROLES = ['brand', 'creator'] as const;
export type Role = (typeof ROLES)[number];

export interface UserAttrs {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRecord = UserAttrs & { _id: Types.ObjectId };

const userSchema = new Schema<UserAttrs>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, immutable: true },
  },
  { timestamps: true },
);

export const UserModel = model<UserAttrs>('User', userSchema);
