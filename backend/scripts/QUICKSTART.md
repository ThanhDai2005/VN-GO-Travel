# POI Geospatial Migration - Quick Reference

## 🚀 Quick Start

```bash
cd backend
./scripts/run-poi-migration.sh
```

This interactive script will:
1. Run audit (read-only)
2. Show you what needs fixing
3. Ask if you want to apply fixes
4. Validate final state

## 📋 Manual Steps

### 1. Audit Only (No Changes)

```bash
cd backend
node scripts/poi-audit-and-migration.js
```

### 2. Apply Fixes

```bash
cd backend
node scripts/poi-migration-fix.js
```

### 3. Verify Results

```bash
cd backend
node scripts/poi-audit-and-migration.js
```

## 🔍 What Gets Fixed

- ✅ Out-of-bounds coordinates (3 POIs)
- ✅ Legacy content fields (all POIs)
- ✅ Missing radius values
- ✅ Invalid radius values
- ✅ Missing required fields
- ✅ Test/incomplete POIs

## ⚠️ Before You Start

1. **Backup your database**
   ```bash
   mongodump --uri="$MONGO_URI" --out=./backup-$(date +%Y%m%d)
   ```

2. **Review audit report**
   - Check what will be changed
   - Verify no unexpected deletions

3. **Test on staging first** (if available)

## 📊 Expected Results

After migration:
- All POIs have valid Vietnam coordinates
- All required fields present
- No duplicate codes
- Geospatial indexes optimized
- Geo queries working correctly

## 🆘 Rollback

If something goes wrong:

```bash
mongorestore --uri="$MONGO_URI" --drop ./backup-YYYYMMDD
```

## 📚 Full Documentation

- **Migration Guide:** `scripts/README-POI-MIGRATION.md`
- **Audit Report:** `scripts/POI-AUDIT-REPORT.md`

## 🧪 Test Queries

After migration, test these:

```bash
# Test nearby search
curl "http://localhost:3000/api/v1/pois/nearby?lat=21.0285&lng=105.8542&radius=1000"

# Test POI by code
curl "http://localhost:3000/api/v1/pois/HO_GUOM"
```

## ✅ Success Criteria

Migration is successful when:
- ✅ Audit shows 0 issues
- ✅ All geo queries return results
- ✅ API endpoints working
- ✅ QR scan functional
- ✅ Geofence triggers working

## 📞 Need Help?

Check the full documentation in:
- `scripts/README-POI-MIGRATION.md`
- `scripts/POI-AUDIT-REPORT.md`
