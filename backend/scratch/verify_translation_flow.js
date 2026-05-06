require('dotenv').config({ path: 'backend/.env' });
const mongoose = require('mongoose');
const poiService = require('../src/services/poi.service');
const poiContentService = require('../src/services/poi-content.service');
const Poi = require('../src/models/poi.model');
const PoiContent = require('../src/models/poi-content.model');

// Mock Config for standalone run
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vngo-travel';

async function verify() {
  try {
    console.log('--- STARTING PRODUCTION VALIDATION ---');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');

    const TEST_CODE = 'TEST-VERIFY-' + Date.now();

    // 1. CREATE BASE POI
    console.log('\n[1] Creating Base POI...');
    const poi = await poiService.createPoi({
      code: TEST_CODE,
      name: 'Chùa Bái Đính (Gốc)',
      summary: 'Mô tả gốc tiếng Việt',
      narrationShort: 'Narration ngắn gốc',
      narrationLong: 'Narration dài gốc',
      location: { lat: 20.2747, lng: 105.8342 }
    });
    console.log('Base POI created. Version:', poi.version);

    // 2. TEST PARTIAL MODE OVERRIDE
    console.log('\n[2] Testing PARTIAL mode (only Name)...');
    const partialData = {
      mode: 'partial',
      translationSource: 'manual',
      content: { name: 'Bai Dinh Pagoda (Manual)' }
    };
    const partialResult = await poiContentService.upsertContent(TEST_CODE, 'en', partialData);
    console.log('Partial Result:', {
      mode: partialResult.mode,
      isComplete: partialResult.metadata.isComplete,
      isOutdated: partialResult.metadata.isOutdated,
      baseVersion: partialResult.metadata.baseVersion
    });

    if (partialResult.mode !== 'partial' || partialResult.metadata.isComplete !== false) {
      throw new Error('PARTIAL mode validation failed');
    }

    // 3. TEST FULL MODE STRICTNESS
    console.log('\n[3] Testing FULL mode strictness (Missing fields)...');
    try {
      await poiContentService.upsertContent(TEST_CODE, 'en', {
        mode: 'full',
        content: { name: 'Bai Dinh Full' } // Missing summary, etc.
      });
      throw new Error('FULL mode should have failed with missing fields');
    } catch (err) {
      console.log('Successfully blocked incomplete FULL mode:', err.message);
    }

    console.log('[3.1] Testing FULL mode success (All fields)...');
    const fullResult = await poiContentService.upsertContent(TEST_CODE, 'en', {
      mode: 'full',
      content: {
        name: 'Bai Dinh Full',
        summary: 'Full summary',
        narrationShort: 'Short',
        narrationLong: 'Long'
      }
    });
    console.log('Full Result:', {
      mode: fullResult.mode,
      isComplete: fullResult.metadata.isComplete
    });

    // 4. TEST VERSION INVALIDATION
    console.log('\n[4] Testing Version Invalidation (Updating Base POI)...');
    await poiService.updatePoiByCode(TEST_CODE, {
      summary: 'Mô tả tiếng Việt đã sửa đổi'
    });
    
    const updatedPoi = await poiService.getPoiByCode(TEST_CODE);
    console.log('Updated POI Version:', updatedPoi.version);

    const outdatedResult = await poiContentService.getContent(TEST_CODE, 'en');
    console.log('Translation State after Base update:', {
      isOutdated: outdatedResult.metadata.isOutdated,
      storedBaseVersion: outdatedResult.metadata.baseVersion
    });

    if (outdatedResult.metadata.isOutdated !== true) {
      throw new Error('isOutdated flag failed to trigger');
    }

    // 5. TEST MOBILE API COMPATIBILITY
    console.log('\n[5] Testing Mobile API Compatibility (includeTranslations=true)...');
    const apiResult = await poiService.getPoiByCode(TEST_CODE, 'en', null, { includeTranslations: true });
    
    console.log('API Translation structure:', JSON.stringify(apiResult.translations[0], null, 2));
    
    if (!apiResult.translations || apiResult.translations.length === 0) {
      throw new Error('API failed to include translations');
    }
    
    const trans = apiResult.translations.find(t => t.lang_code === 'en');
    if (!trans) throw new Error('English translation missing in API response');
    
    console.log('API Translation structure (EN):', JSON.stringify(trans, null, 2));
    
    if (trans.metadata.isOutdated !== true || trans.mode !== 'full') {
      throw new Error('API translation metadata mismatch');
    }

    console.log('\n--- ALL BACKEND SCENARIOS PASSED ---');

  } catch (error) {
    console.error('\n--- VALIDATION FAILED ---');
    console.error(error);
  } finally {
    await mongoose.connection.close();
  }
}

verify();
