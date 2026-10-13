import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { connectDb, disconnectDb } from '../../src/lib/db';

/**
 * Registers hooks that give the current describe block an in-memory MongoDB
 * replica set (transactions need one). Collections are emptied after every test.
 */
export function useTestDb(): void {
  let replSet: MongoMemoryReplSet | undefined;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    await connectDb(replSet.getUri());
    // Build indexes (e.g. unique email, unique postKey) before tests rely on them.
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  });

  afterEach(async () => {
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectDb();
    await replSet?.stop();
  });
}
