# POI Core Geospatial Migration Guide

## Overview

This migration transforms the POI collection into a clean, normalized, geospatial-ready foundation that serves as the single source of truth for all location-based features.

## Target Structure

```javascript
{
  _id: ObjectId,
  code: String (UNIQUE, REQUIRED),
  location: {
    type: "Point",
    coordinates: [lng, lat]  // GeoJSON format
  },
  radius: Number,           // meters, default 50
  priority: Number,         // default 0
  languageCode: String,     // default 'vi'
  name: String,             // REQUIRED
  summary: String,
  narrationShort: String,
  narrationLong: String,
  isPremiumOnly: Boolean,   // default false
  status: String,           // APPROVED, PENDING, REJECTED
  submittedBy: ObjectId,    // ref to User
  rejectionReason: String,
  createdAt: Date,
  updatedAt: Date
}
```

## Required Indexes

```javascript
// Unique code index
db.pois.createIndex({ code: 1 }, { unique: true })

// Geospatial index for $near queries
db.pois.createIndex({ location: "2dsphere" })

// Compound index for filtered queries
db.pois.createIndex({ code: 1, status: 1 })
```

## Migration Scripts

### 1. Audit Script (Read-Only)

**File:** `scripts/poi-audit-and-migration.js`

**Purpose:** Analyze current POI data and identify issues without making changes.

**Usage:**
```bash
cd backend
node scripts/poi-audit-and-migration.js
```

**What it checks:**
- ✅ Coordinate format and validity
- ✅ Vietnam boundary validation
- ✅ Duplicate codes
- ✅ Missing required fields
- ✅ Invalid radius values
- ✅ Legacy content fields
- ✅ Index existence
- ✅ Geospatial query functionality

**Output:**
- Detailed audit report
- Issue breakdown by type
- Statistics (avg radius, priority distribution, etc.)
- Recommendations for fixes

### 2. Migration Fix Script

**File:** `scripts/poi-migration-fix.js`

**Purpose:** Apply fixes to resolve issues found in audit.

**Usage:**
```bash
cd backend
node scripts/poi-migration-fix.js
```

**What it fixes:**
- 🔧 Out-of-bounds coordinates (fixes known issues, deletes invalid)
- 🔧 Missing radius (sets default 50m)
- 🔧 Invalid radius (normalizes to 100m)
- 🔧 Missing required fields (sets defaults)
- 🔧 Legacy content fields (removes)
- 🔧 Duplicate codes (merges, keeps most complete)
- 🔧 Missing indexes (creates)

**Safety:**
- ⚠️ **BACKUP YOUR DATABASE FIRST**
- Run audit script first to see what will change
- Script validates final state after migration

## Step-by-Step Migration Process

### Step 1: Backup Database

```bash
# MongoDB Atlas: Use Atlas UI to create backup
# Local MongoDB:
mongodump --uri="mongodb://localhost:27017/vngo_travel" --out=./backup-$(date +%Y%m%d)
```

### Step 2: Run Audit (Dry Run)

```bash
cd backend
node scripts/poi-audit-and-migration.js
```

Review the output carefully:
- Check how many POIs have issues
- Identify which POIs will be deleted
- Verify duplicate resolution strategy

### Step 3: Apply Migration

```bash
cd backend
node scripts/poi-migration-fix.js
```

Monitor the output:
- Ensure no unexpected errors
- Verify counts match audit predictions
- Check final validation passes

### Step 4: Verify Results

```bash
# Run audit again to confirm all issues resolved
node scripts/poi-audit-and-migration.js
```

Expected output:
```
✅ POI collection is clean and ready!
   - All coordinates are valid and in GeoJSON format
   - All codes are unique
   - All required fields are present
   - Geospatial indexes are in place
   - Geo queries are working correctly
```

### Step 5: Test Application

1. **Test nearby search:**
   ```bash
   curl "http://localhost:3000/api/v1/pois/nearby?lat=21.0285&lng=105.8542&radius=1000"
   ```

2. **Test QR scan:**
   - Generate QR for a POI
   - Scan QR in mobile app
   - Verify POI data loads correctly

3. **Test geofence detection:**
   - Move to POI location in app
   - Verify audio triggers correctly

4. **Test heatmap:**
   - Check admin dashboard
   - Verify POI locations render correctly

## Known Issues and Fixes

### Issue 1: Hạ Long Bay Wrong Coordinates

**Problem:** POI `ha-long` has coordinates `[106.1234, 10.2345]` which is in southern Vietnam, not Quảng Ninh.

**Fix:** Script automatically updates to correct coordinates `[107.0843, 20.9101]`

### Issue 2: Chùa Bái Đính Out of Bounds

**Problem:** POI `CHUA-BAI-DINH` has coordinates `[110.8542, 24.0285]` which is outside Vietnam.

**Fix:** Script updates to correct coordinates `[105.9167, 20.2500]` (Ninh Bình)

### Issue 3: Test POIs with Invalid Data

**Problem:** POIs like `NNNN`, `hhh` have minimal/test data.

**Fix:** Script validates and either fixes or deletes based on data completeness.

## Validation Queries

After migration, run these queries to verify:

### 1. Check all coordinates are in Vietnam

```javascript
db.pois.find({
  $or: [
    { "location.coordinates.0": { $lt: 102.1 } },
    { "location.coordinates.0": { $gt: 114.0 } },
    { "location.coordinates.1": { $lt: 8.5 } },
    { "location.coordinates.1": { $gt: 23.4 } }
  ]
})
// Should return 0 documents
```

### 2. Check for duplicate codes

```javascript
db.pois.aggregate([
  { $group: { _id: "$code", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])
// Should return 0 documents
```

### 3. Test geospatial query

```javascript
db.pois.find({
  location: {
    $near: {
      $geometry: {
        type: "Point",
        coordinates: [105.8542, 21.0285]
      },
      $maxDistance: 1000
    }
  }
}).limit(5)
// Should return POIs near Hồ Hoàn Kiếm
```

### 4. Verify indexes

```javascript
db.pois.getIndexes()
// Should include:
// - { code: 1 } with unique: true
// - { location: "2dsphere" }
// - { code: 1, status: 1 }
```

## Rollback Procedure

If migration fails or causes issues:

### Option 1: Restore from Backup

```bash
# MongoDB Atlas: Use Atlas UI to restore
# Local MongoDB:
mongorestore --uri="mongodb://localhost:27017/vngo_travel" --drop ./backup-YYYYMMDD
```

### Option 2: Manual Rollback

If you need to undo specific changes:

```javascript
// Restore legacy content field (if needed)
db.pois.updateMany(
  { content: null },
  { $set: { content: { vi: "$narrationLong" } } }
)

// Remove indexes
db.pois.dropIndex("idx_code_unique")
db.pois.dropIndex("idx_location_2dsphere")
```

## Post-Migration Tasks

### 1. Update Related Collections

Ensure other collections reference POIs correctly:

```javascript
// Check intelligence events
db.uis_events_raw.find({ "payload.poi_id": { $exists: true } }).limit(5)

// Check hourly stats
db.poi_hourly_stats.find({}).limit(5)

// Check audio queue
db.audio_queues.find({}).limit(5)
```

### 2. Clear Application Caches

```javascript
// In your application code
poiCache.clear();
```

### 3. Update Documentation

- Update API documentation with new POI structure
- Update mobile app integration guide
- Update admin dashboard documentation

## Monitoring

After migration, monitor:

1. **API Performance:**
   - Check `/api/v1/pois/nearby` response times
   - Verify geospatial queries use indexes (use `.explain()`)

2. **Error Logs:**
   - Watch for POI not found errors
   - Check for coordinate validation errors

3. **User Reports:**
   - Monitor QR scan success rate
   - Check geofence trigger accuracy

## Support

If you encounter issues:

1. Check audit report for specific problems
2. Review error logs in migration output
3. Verify database connection and permissions
4. Ensure MongoDB version supports 2dsphere indexes (3.2+)

## Future Enhancements

After successful migration, consider:

1. **Multi-language content:** Separate `poi_contents` collection
2. **Audio assets:** Separate `audio_assets` collection
3. **Zone system:** Group POIs into zones for bulk operations
4. **Advanced geofencing:** Polygon-based zones instead of radius

## Changelog

- **2026-04-23:** Initial migration scripts created
- **2026-04-23:** Added validation and rollback procedures
