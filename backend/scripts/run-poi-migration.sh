#!/bin/bash

# POI Migration Quick Start Script
# This script guides you through the POI geospatial migration process

set -e

echo "=========================================="
echo "POI GEOSPATIAL MIGRATION - QUICK START"
echo "=========================================="
echo ""

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the backend directory"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found"
    echo "   Please create .env with MONGO_URI and JWT_SECRET"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🔍 Step 1: Running POI Audit (Read-Only)"
echo "=========================================="
echo ""
echo "This will analyze your POI collection without making any changes."
echo ""
read -p "Press Enter to continue..."
echo ""

node scripts/poi-audit-and-migration.js

echo ""
echo "=========================================="
echo "📊 Audit Complete!"
echo "=========================================="
echo ""
echo "Please review the audit report above."
echo ""
echo "Next steps:"
echo "  1. If issues found: Run migration fix script"
echo "  2. If no issues: Your POI collection is ready!"
echo ""
read -p "Do you want to run the migration fix script? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "⚠️  WARNING: This will modify your database!"
    echo ""
    read -p "Have you backed up your database? (y/N): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "🔧 Step 2: Running Migration Fix"
        echo "=========================================="
        echo ""

        node scripts/poi-migration-fix.js

        echo ""
        echo "=========================================="
        echo "✅ Migration Complete!"
        echo "=========================================="
        echo ""
        echo "Running final validation..."
        echo ""

        node scripts/poi-audit-and-migration.js

        echo ""
        echo "=========================================="
        echo "🎉 All Done!"
        echo "=========================================="
        echo ""
        echo "Your POI collection is now clean and geospatially optimized."
        echo ""
        echo "Next steps:"
        echo "  1. Test your API endpoints"
        echo "  2. Test QR scan functionality"
        echo "  3. Verify geofence triggers"
        echo "  4. Check admin dashboard"
        echo ""
    else
        echo ""
        echo "⚠️  Please backup your database first!"
        echo ""
        echo "MongoDB Atlas: Use Atlas UI to create snapshot"
        echo "Local MongoDB: mongodump --uri=\"\$MONGO_URI\" --out=./backup-\$(date +%Y%m%d)"
        echo ""
    fi
else
    echo ""
    echo "Migration cancelled. Your database was not modified."
    echo ""
fi

echo "For detailed documentation, see:"
echo "  - scripts/README-POI-MIGRATION.md"
echo "  - scripts/POI-AUDIT-REPORT.md"
echo ""
