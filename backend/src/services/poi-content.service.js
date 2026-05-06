const PoiContent = require('../models/poi-content.model');
const Poi = require('../models/poi.model');
const { AppError } = require('../middlewares/error.middleware');

const { TranslationAudit, TranslationHistory, TranslationSession } = require('../models/translation-safety.model');

// In-memory JIT limiter (Simplified for production without Redis)
const jitRequests = new Map(); // userId -> { count, lastReset }
const JIT_LIMIT = 5;
const JIT_WINDOW_MS = 60000;

class PoiContentService {
  /**
   * Utility: Check if all required fields are present for FULL mode
   */
  isTranslationComplete(content) {
    if (!content) return false;
    const required = ['name', 'summary', 'narrationShort', 'narrationLong'];
    return required.every(f => content[f] && content[f].trim() !== '');
  }

  /**
   * Utility: Normalize a record for API response, enforcing runtime safety
   */
  normalizeTranslation(record) {
    if (!record || record.isDeleted) return null;

    const isComplete = this.isTranslationComplete(record.content);
    
    // Enforce Safety: If mode is FULL but content is incomplete, auto-downgrade at runtime
    let effectiveMode = record.mode;
    if (effectiveMode === 'full' && !isComplete) {
      effectiveMode = 'partial';
    }

    return {
      lang_code: record.lang_code,
      mode: effectiveMode,
      translationSource: record.translationSource || 'manual',
      content: {
        name: record.content?.name || '',
        summary: record.content?.summary || '',
        narrationShort: record.content?.narrationShort || '',
        narrationLong: record.content?.narrationLong || ''
      },
      metadata: {
        isComplete, // Computed at runtime
        isOutdated: record.metadata?.isOutdated || false,
        baseVersion: record.metadata?.baseVersionAtUpdate || 1,
        translatedVersion: record.metadata?.translatedVersion || 1,
        confidenceScore: record.metadata?.confidenceScore || 1.0,
        updatedAt: record.updatedAt,
        updatedBy: record.metadata?.updatedBy
      }
    };
  }

  /**
   * Get content for a POI in a specific language
   */
  async getContent(poiCode, lang_code = 'vi') {
    const doc = await PoiContent.findOne({ poiCode, lang_code, isDeleted: false }).lean();
    return this.normalizeTranslation(doc);
  }

  /**
   * Get all translations for a POI
   */
  async getAllContentForPoi(poiCode) {
    const docs = await PoiContent.find({ poiCode, isDeleted: false }).lean();
    return docs.map(d => this.normalizeTranslation(d)).filter(Boolean);
  }

  /**
   * Get translation history snapshots
   */
  async getHistory(poiCode, lang_code) {
    return await TranslationHistory.find({ poiCode, lang_code })
        .sort({ version: -1 })
        .limit(10)
        .populate('createdBy', 'name email')
        .lean();
  }

  /**
   * Utility: Validate content with strict enterprise constraints
   */
  _validateContent(mode, content) {
    if (!content) throw new AppError('Content block is required', 400);

    // Hardening: Trim all inputs and check length
    const fields = ['name', 'summary', 'narrationShort', 'narrationLong'];
    const lengths = { name: 150, summary: 500, narrationShort: 5000, narrationLong: 5000 };

    fields.forEach(f => {
        if (content[f]) {
            content[f] = String(content[f]).trim();
            if (content[f].length > lengths[f]) {
                throw new AppError(`Field ${f} exceeds max length of ${lengths[f]}`, 400);
            }
        }
    });

    if (mode === 'full') {
      if (!this.isTranslationComplete(content)) {
        throw new AppError('FULL mode requires all fields (name, summary, narrationShort, narrationLong)', 400);
      }
    } else {
      const hasContent = Object.values(content).some(v => v && v.trim() !== '');
      if (!hasContent) {
        throw new AppError('PARTIAL mode requires at least one non-empty field', 400);
      }
    }
  }

  /**
   * Create or Update translation with Overwrite Protection & History
   */
  async upsertContent(poiCode, lang_code, data, userId = null, options = {}) {
    const { mode, content, audio, translationSource = 'manual', overwrite = false, overwriteReason = '' } = data;
    const { expectedBaseVersion = null, req = {} } = options;
    
    // 1. Fetch Base POI for versioning
    const basePoi = await Poi.findOne({ code: poiCode });
    if (!basePoi) throw new AppError('Base POI not found', 404);

    // 2. CONCURRENCY & OVERWRITE PROTECTION
    const existing = await PoiContent.findOne({ poiCode, lang_code });
    
    if (!overwrite && expectedBaseVersion !== null && basePoi.version > expectedBaseVersion) {
        throw new AppError('VERSION_CONFLICT: The base POI content has been updated by another user.', 409);
    }

    if (overwrite && !overwriteReason) {
        throw new AppError('OVERWRITE_REASON_REQUIRED: A reason is mandatory for overwriting conflicts.', 400);
    }

    // 3. Validation
    this._validateContent(mode, content);

    // 4. Rate Limit check for JIT
    if (translationSource.startsWith('jit_')) {
        this._checkJitRateLimit(userId, req);
    }

    // 5. Save History before update
    if (existing && !existing.isDeleted) {
        await new TranslationHistory({
            poiCode,
            lang_code,
            version: existing.metadata.translatedVersion,
            snapshot: { mode: existing.mode, content: existing.content, metadata: existing.metadata },
            createdBy: existing.metadata.updatedBy
        }).save();
    }

    // 6. Audit Logging for Overwrite
    if (overwrite && existing) {
        await new TranslationAudit({
            poiCode,
            lang_code,
            action: 'overwrite',
            performedBy: userId,
            oldVersion: existing.metadata.translatedVersion,
            newVersion: (existing.metadata.translatedVersion || 0) + 1,
            reason: overwriteReason,
            diffSnapshot: { before: existing.content, after: content }
        }).save();
    }

    // 7. Upsert logic with Resurrection Safety
    const update = {
      mode,
      translationSource,
      content,
      audio: audio || {},
      isDeleted: false,
      metadata: {
        isOutdated: false,
        baseVersionAtUpdate: basePoi.version || 1,
        translatedVersion: (existing && !existing.isDeleted) ? (existing.metadata.translatedVersion + 1) : 1,
        updatedBy: userId,
        confidenceScore: translationSource === 'jit_en' ? 0.7 : 1.0
      }
    };

    // If recreating a deleted record, track the deleted version to avoid stale resurrection
    if (existing && existing.isDeleted) {
        update.metadata.resurrectedFromVersion = existing.metadata.translatedVersion;
    }

    const result = await PoiContent.findOneAndUpdate({ poiCode, lang_code }, update, {
      new: true,
      upsert: true,
      runValidators: true
    });

    return this.normalizeTranslation(result);
  }

  /**
   * Rollback translation to a specific historical version
   */
  async rollback(poiCode, lang_code, version, userId) {
    const history = await TranslationHistory.findOne({ poiCode, lang_code, version });
    if (!history) throw new AppError('History snapshot not found', 404);

    // Create a new version from the snapshot
    const rollbackData = {
        mode: history.snapshot.mode,
        content: history.snapshot.content,
        translationSource: 'manual', // Rollback is always considered manual override
        overwrite: true,
        overwriteReason: `Rollback to version ${version}`
    };

    const result = await this.upsertContent(poiCode, lang_code, rollbackData, userId);
    
    // Audit log for rollback
    await new TranslationAudit({
        poiCode,
        lang_code,
        action: 'rollback',
        performedBy: userId,
        oldVersion: history.version,
        newVersion: result.metadata.translatedVersion,
        reason: `Rollback to version ${version}`,
        diffSnapshot: { before: 'ROLLBACK_TRIGGERED', after: history.snapshot.content }
    }).save();

    return result;
  }

  _checkJitRateLimit(userId, req = {}) {
      if (!userId) return;
      
      const ip = req.ip || req.headers?.['x-forwarded-for'] || 'unknown';
      const endpoint = req.originalUrl || 'jit';
      const key = `${userId}:${ip}:${endpoint}`; // Hardened Key: User + IP + Endpoint
      
      const now = Date.now();
      
      // Global System-wide Limiter (100 / minute)
      let globalRecord = jitRequests.get('__GLOBAL__') || { count: 0, lastReset: now };
      if (now - globalRecord.lastReset > JIT_WINDOW_MS) {
          globalRecord = { count: 0, lastReset: now };
      }
      if (globalRecord.count >= 100) {
          throw new AppError('SYSTEM_RATE_LIMIT: System-wide AI limit exceeded. Retry later.', 429);
      }
      globalRecord.count += 1;
      jitRequests.set('__GLOBAL__', globalRecord);

      // Per-user Hardened Limiter
      let record = jitRequests.get(key);
      if (!record || (now - record.lastReset > JIT_WINDOW_MS)) {
          record = { count: 0, lastReset: now };
      }
      
      if (record.count >= JIT_LIMIT) {
          const retryAfter = Math.ceil((JIT_WINDOW_MS - (now - record.lastReset)) / 1000);
          const err = new AppError('RATE_LIMIT: Too many AI requests. Please wait.', 429);
          err.retryAfter = retryAfter;
          throw err;
      }
      
      record.count += 1;
      jitRequests.set(key, record);
  }

  /**
   * Mark translations as outdated when base POI changes
   */
  async markAsOutdated(poiCode, currentBaseVersion) {
    await PoiContent.updateMany(
      { 
        poiCode,
        isDeleted: false,
        'metadata.baseVersionAtUpdate': { $lt: currentBaseVersion } 
      },
      { 
        $set: { 'metadata.isOutdated': true } 
      }
    );
  }

  /**
   * Soft Delete translation
   */
  async deleteContent(poiCode, lang_code, userId = null) {
    const result = await PoiContent.findOneAndUpdate(
        { poiCode, lang_code, isDeleted: false },
        { 
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: userId
        }
    );
    return !!result;
  }

  async getStatistics() {
    const totalContent = await PoiContent.countDocuments({});
    const languages = await PoiContent.distinct('language');
    const languageStats = await PoiContent.aggregate([
      { $group: { _id: '$language', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    return {
      totalContent,
      totalLanguages: languages.length,
      languages: languageStats.map(l => ({ language: l._id, count: l.count }))
    };
  }
}

module.exports = new PoiContentService();
