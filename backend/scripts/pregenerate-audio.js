require('dotenv').config();
const mongoose = require('mongoose');
const Zone = require('../src/models/zone.model');
const Poi = require('../src/models/poi.model');
const Audio = require('../src/models/audio.model');
const audioService = require('../src/services/audio.service');
const config = require('../src/config');

const TARGET_LANGUAGES = ['vi', 'en', 'ja', 'ko'];

async function pregenerate() {
    try {
        console.log('[PreGen] Connecting to MongoDB...');
        await mongoose.connect(config.mongoUri);
        console.log('[PreGen] Connected.');

        const zones = await Zone.find({ isActive: true });
        console.log(`[PreGen] Found ${zones.length} active zones.`);

        for (const zone of zones) {
            console.log(`[PreGen] Zone: ${zone.code} (${zone.name})`);
            
            const pois = await Poi.find({ 
                code: { $in: zone.poiCodes },
                status: 'APPROVED'
            });
            
            console.log(`[PreGen]   Found ${pois.length} approved POIs in zone.`);

            for (const poi of pois) {
                console.log(`[PreGen]   POI: ${poi.code} (v${poi.version || 1})`);
                
                const texts = [];
                if (poi.narrationShort) texts.push(poi.narrationShort);
                if (poi.narrationLong) texts.push(poi.narrationLong);
                
                for (const text of texts) {
                    for (const lang of TARGET_LANGUAGES) {
                        const version = poi.version || 1;
                        
                        // Check if already ready in DB
                        const hash = audioService.getHash(text, lang, 'female', version);
                        const existing = await Audio.findOne({ hash, status: 'ready' });
                        
                        if (existing) {
                            console.log(`[PreGen]     Skipped [${lang}]: ${hash.substring(0, 10)}...`);
                            continue;
                        }

                        console.log(`[PreGen]     Generating [${lang}]: ${hash.substring(0, 10)}...`);
                        try {
                            await audioService.generateAudio({
                                text,
                                language: lang,
                                version,
                                poiCode: poi.code,
                                zoneCode: zone.code
                            });
                        } catch (err) {
                            console.error(`[PreGen]     FAILED [${lang}]:`, err.message);
                        }
                    }
                }
            }
        }

        console.log('[PreGen] Finished successfully.');
    } catch (err) {
        console.error('[PreGen] ERROR:', err.message);
    } finally {
        await mongoose.disconnect();
    }
}

pregenerate();
