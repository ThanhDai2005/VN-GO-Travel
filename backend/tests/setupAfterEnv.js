const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

/** Replica set required: Mongoose 9 + `withTransaction` (admin POI approve) fails on standalone MongoMemoryServer. */
let replSet;

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    process.env.MONGO_URI = uri;
    process.env.INTELLIGENCE_INGEST_API_KEY = process.env.INTELLIGENCE_INGEST_API_KEY || 'test-intel-ingest-key';
    await mongoose.connect(uri);
    // eslint-disable-next-line global-require
    global.__APP__ = require('../src/app');
}, 120000);

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.dropDatabase().catch(() => {});
        await mongoose.disconnect();
    }
    if (replSet) {
        await replSet.stop();
    }
    delete global.__APP__;
}, 60000);

afterEach(async () => {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
        return;
    }
    const cols = await mongoose.connection.db.collections();
    for (const col of cols) {
        await col.deleteMany({});
    }
});
