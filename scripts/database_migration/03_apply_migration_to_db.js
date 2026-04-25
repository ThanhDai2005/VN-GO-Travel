/**
 * 03_apply_migration_to_db.js
 * 
 * This script connects to the live MongoDB Atlas cluster,
 * drops legacy collections, initializes the new schema,
 * and seeds the migrated data.
 * 
 * WARNING: This is a DESTRUCTIVE script (FULL REFACTOR).
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'backend', '.env') });

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
const dbName = 'vngo_travel';

const migratedDir = path.join(__dirname, '..', '..', 'backend', 'mongo', 'migrated');

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas.");
    const db = client.db(dbName);

    // 1. Drop Legacy Collections
    const legacyCollections = [
      'pois', 'users', 'uis_events_raw', 'uis_events_raw.audio_heatmap_samples',
      'uis_analytics_rollups_daily', 'uis_analytics_rollups_hourly',
      'uis_device_profiles', 'uis_user_profiles', 'uis_user_sessions',
      'devicesessions', 'poirequests', 'translationcaches', 'adminpoiaudits'
    ];

    console.log("Dropping legacy collections...");
    for (const collName of legacyCollections) {
      try {
        await db.collection(collName).drop();
        console.log(`- Dropped: ${collName}`);
      } catch (e) {
        // Ignore if collection doesn't exist
      }
    }

    // 2. Initialize New Schema & Indexes (Mirroring 01_schema_indexes.js)
    console.log("Initializing new schema and indexes...");
    
    // pois
    await db.collection('pois').createIndex({ code: 1 }, { unique: true });
    await db.collection('pois').createIndex({ location: "2dsphere" });

    // poi_contents
    await db.collection('poi_contents').createIndex({ poiId: 1, languageCode: 1 }, { unique: true });

    // audio_assets
    await db.collection('audio_assets').createIndex({ poiId: 1, languageCode: 1, type: 1 });

    // zones & zone_pois
    await db.collection('zones').createIndex({ code: 1 }, { unique: true });
    await db.collection('zone_pois').createIndex({ zoneId: 1, poiId: 1 }, { unique: true });

    // users, wallets, transactions
    await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
    await db.collection('user_wallets').createIndex({ userId: 1 }, { unique: true });
    await db.collection('transactions').createIndex({ userId: 1, createdAt: -1 });

    // unlock system
    await db.collection('user_unlock_pois').createIndex({ userId: 1, poiId: 1 }, { unique: true });
    await db.collection('user_unlock_zones').createIndex({ userId: 1, zoneId: 1 }, { unique: true });

    // event tracking
    await db.collection('user_poi_events').createIndex({ poiId: 1, eventType: 1 });
    await db.collection('user_poi_events').createIndex({ createdAt: -1 });
    await db.collection('user_poi_events').createIndex({ userId: 1, eventType: 1 });

    // audio sessions & admin
    await db.collection('audio_sessions').createIndex({ userId: 1, poiId: 1 });
    await db.collection('poi_submissions').createIndex({ status: 1 });
    await db.collection('admin_audit_logs').createIndex({ entityType: 1, entityId: 1 });

    console.log("New schema and indexes initialized.");

    // 3. Seed Migrated Data
    const seedFiles = [
      { coll: 'pois', file: 'pois.json' },
      { coll: 'poi_contents', file: 'poi_contents.json' },
      { coll: 'audio_assets', file: 'audio_assets.json' },
      { coll: 'users', file: 'users.json' },
      { coll: 'user_poi_events', file: 'user_poi_events.json' }
    ];

    console.log("Seeding migrated data...");

    for (const seed of seedFiles) {
      const dataPath = path.join(migratedDir, seed.file);
      if (fs.existsSync(dataPath)) {
        let docs = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        
        // Convert $oid strings back to real ObjectIDs
        docs = docs.map(doc => {
            const processObj = (obj) => {
                for (let key in obj) {
                    if (obj[key] && typeof obj[key] === 'object') {
                        if (obj[key].$oid) {
                            obj[key] = require('mongodb').ObjectId.createFromHexString(obj[key].$oid);
                        } else if (obj[key].$date) {
                            obj[key] = new Date(obj[key].$date);
                        } else {
                            processObj(obj[key]);
                        }
                    }
                }
            };
            processObj(doc);
            return doc;
        });

        if (docs.length > 0) {
          await db.collection(seed.coll).insertMany(docs);
          console.log(`- Seeded ${docs.length} documents into ${seed.coll}`);
        }
      }
    }

    console.log("Migration and Seeding Complete!");

  } catch (err) {
    console.error("Migration Failed:", err);
  } finally {
    await client.close();
  }
}

run();
