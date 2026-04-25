/**
 * 01_schema_indexes.js
 * Run this script in the MongoDB shell to initialize the Target Architecture collections and indexes.
 * Example: mongosh <database_name> 01_schema_indexes.js
 */

print("Starting Schema and Index Initialization...");

const dbName = db.getName();
print(`Target Database: ${dbName}`);

// --- 1. POI CORE ---
print("Creating 'pois' collection and indexes...");
db.createCollection("pois");
db.pois.createIndex({ code: 1 }, { unique: true, name: "idx_pois_code" });
db.pois.createIndex({ location: "2dsphere" }, { name: "idx_pois_location" });

// --- 2. POI CONTENT (MULTI-LANGUAGE) ---
print("Creating 'poi_contents' collection and indexes...");
db.createCollection("poi_contents");
db.poi_contents.createIndex({ poiId: 1, languageCode: 1 }, { unique: true, name: "idx_poi_contents_poiId_lang" });

// --- 3. AUDIO ASSETS ---
print("Creating 'audio_assets' collection and indexes...");
db.createCollection("audio_assets");
db.audio_assets.createIndex({ poiId: 1, languageCode: 1, type: 1 }, { name: "idx_audio_assets_poiId_lang_type" });

// --- 4. ZONE SYSTEM ---
print("Creating 'zones' and 'zone_pois' collections and indexes...");
db.createCollection("zones");
db.createCollection("zone_pois");
db.zones.createIndex({ code: 1 }, { unique: true, name: "idx_zones_code" });
db.zone_pois.createIndex({ zoneId: 1, poiId: 1 }, { unique: true, name: "idx_zone_pois_zoneId_poiId" });

// --- 5. USER SYSTEM ---
print("Creating 'users', 'user_wallets', and 'transactions' collections...");
db.createCollection("users");
db.createCollection("user_wallets");
db.createCollection("transactions");
db.users.createIndex({ email: 1 }, { unique: true, sparse: true, name: "idx_users_email" });
db.user_wallets.createIndex({ userId: 1 }, { unique: true, name: "idx_user_wallets_userId" });
db.transactions.createIndex({ userId: 1, createdAt: -1 }, { name: "idx_transactions_userId_createdAt" });

// --- 6. UNLOCK SYSTEM ---
print("Creating 'user_unlock_pois' and 'user_unlock_zones'...");
db.createCollection("user_unlock_pois");
db.createCollection("user_unlock_zones");
db.user_unlock_pois.createIndex({ userId: 1, poiId: 1 }, { unique: true, name: "idx_user_unlock_pois_userId_poiId" });
db.user_unlock_zones.createIndex({ userId: 1, zoneId: 1 }, { unique: true, name: "idx_user_unlock_zones_userId_zoneId" });

// --- 7. EVENT TRACKING (CRITICAL) ---
print("Creating 'user_poi_events' collection and indexes...");
db.createCollection("user_poi_events");
db.user_poi_events.createIndex({ poiId: 1, eventType: 1 }, { name: "idx_user_poi_events_poiId_eventType" });
db.user_poi_events.createIndex({ createdAt: -1 }, { name: "idx_user_poi_events_createdAt" });
db.user_poi_events.createIndex({ userId: 1, eventType: 1 }, { name: "idx_user_poi_events_userId_eventType" });

// --- 8. AUDIO SESSION ---
print("Creating 'audio_sessions' collection...");
db.createCollection("audio_sessions");
db.audio_sessions.createIndex({ userId: 1, poiId: 1 }, { name: "idx_audio_sessions_userId_poiId" });

// --- 9. ADMIN / AUDIT ---
print("Creating 'poi_submissions' and 'admin_audit_logs'...");
db.createCollection("poi_submissions");
db.createCollection("admin_audit_logs");
db.poi_submissions.createIndex({ status: 1 }, { name: "idx_poi_submissions_status" });
db.admin_audit_logs.createIndex({ entityType: 1, entityId: 1 }, { name: "idx_admin_audit_logs_entity" });

print("Schema and Index Initialization Complete.");
