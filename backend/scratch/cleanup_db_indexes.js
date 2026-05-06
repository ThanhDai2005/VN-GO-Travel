require('dotenv').config({ path: 'backend/.env' });
const mongoose = require('mongoose');

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const db = mongoose.connection.db;
    const collection = db.collection('poi_contents');

    console.log('Fetching indexes...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(idx => idx.name));

    const legacyIndexName = 'poiId_1_languageCode_1';
    if (indexes.some(idx => idx.name === legacyIndexName)) {
      console.log(`Dropping legacy index: ${legacyIndexName}...`);
      await collection.dropIndex(legacyIndexName);
      console.log('Dropped successfully.');
    } else {
      console.log('Legacy index not found in schema-enforced list.');
      // Try to find by key pattern if name is different
      const legacyByPattern = indexes.find(idx => idx.key.poiId !== undefined && idx.key.languageCode !== undefined);
      if (legacyByPattern) {
        console.log(`Dropping legacy index by pattern: ${legacyByPattern.name}...`);
        await collection.dropIndex(legacyByPattern.name);
        console.log('Dropped successfully.');
      }
    }

    console.log('Cleanup complete.');
  } catch (error) {
    console.error('Cleanup failed:', error);
  } finally {
    await mongoose.connection.close();
  }
}

cleanup();
