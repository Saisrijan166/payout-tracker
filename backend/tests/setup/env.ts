// Runs before every test file (jest `setupFiles`), before src/config/env.ts is imported.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
// Each integration suite connects to its own in-memory replica set; this value only satisfies env validation.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused-in-tests';
process.env.CORS_ORIGIN = 'http://localhost:3000';
