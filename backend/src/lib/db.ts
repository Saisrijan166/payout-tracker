import mongoose from 'mongoose';
import { logger } from './logger';

mongoose.set('strictQuery', true);

/**
 * Connects Mongoose and fails fast if MongoDB is not a replica set: the payout
 * service relies on multi-document transactions, which standalone servers lack.
 */
export async function connectDb(uri: string): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });

  const hello = await mongoose.connection.db?.admin().command({ hello: 1 });
  const setName: unknown = hello?.setName;
  const isMongos: unknown = hello?.msg;
  if (typeof setName !== 'string' && isMongos !== 'isdbgrid') {
    await mongoose.disconnect();
    throw new Error(
      'MongoDB must run as a replica set (transactions are required). See README for local setup.',
    );
  }

  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
