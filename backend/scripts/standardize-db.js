/**
 * PRODUCTION DATA STANDARDIZER
 * Standardizes POIs and Zones in MongoDB to ensure consistency with Mobile App.
 * Run with: node scripts/standardize-db.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Poi = require('../src/models/poi.model');
const Zone = require('../src/models/zone.model');
const PoiContent = require('../src/models/poi-content.model');
const { POI_STATUS } = require('../src/constants/poi-status');

async function standardize() {
    try {
        console.log('[STANDARDIZE] Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('[STANDARDIZE] Connected successfully.');

        // 1. Fetch all Zones
        const zones = await Zone.find({});
        console.log(`[STANDARDIZE] Found ${zones.length} zones.`);

        // 2. Standardize POIs based on Zones
        for (const zone of zones) {
            console.log(`[STANDARDIZE] Processing Zone: ${zone.name} (${zone.code})`);

            if (zone.poiCodes && zone.poiCodes.length > 0) {
                // Update all POIs belonging to this zone
                const result = await Poi.updateMany(
                    { code: { $in: zone.poiCodes } },
                    {
                        $set: {
                            isPremiumOnly: true, // Most zone POIs should be premium
                            status: POI_STATUS.APPROVED,
                            zoneCode: zone.code,
                            zoneName: zone.name
                        }
                    }
                );
                console.log(`[STANDARDIZE] Updated ${result.modifiedCount} POIs for zone ${zone.code}`);

                // Ensure PoiContent also exists for these POIs
                for (const poiCode of zone.poiCodes) {
                    const poi = await Poi.findOne({ code: poiCode });
                    if (poi) {
                        const existingContent = await PoiContent.findOne({ poiCode, lang_code: 'vi' });
                        if (!existingContent) {
                            await PoiContent.create({
                                poiCode,
                                lang_code: 'vi',
                                mode: 'full',
                                translationSource: 'manual',
                                content: {
                                    name: poi.name,
                                    summary: poi.summary,
                                    narrationShort: poi.narrationShort,
                                    narrationLong: poi.narrationLong
                                },
                                metadata: { translatedVersion: poi.version }
                            });
                            console.log(`[STANDARDIZE] Created missing PoiContent (vi) for ${poiCode}`);
                        }
                    }
                }
            }
        }

        // 3. Mark standalone POIs (not in any zone) as free
        const zonePoiCodes = zones.flatMap(z => z.poiCodes || []);
        const standaloneResult = await Poi.updateMany(
            { code: { $nin: zonePoiCodes } },
            { $set: { isPremiumOnly: false, zoneCode: null, zoneName: null } }
        );
        console.log(`[STANDARDIZE] Marked ${standaloneResult.modifiedCount} standalone POIs as free.`);

        console.log('[STANDARDIZE] COMPLETED SUCCESSFULLY!');
        process.exit(0);
    } catch (error) {
        console.error('[STANDARDIZE] ERROR:', error);
        process.exit(1);
    }
}

standardize();
