const PoiContent = require('../models/poi-content.model');
const { TranslationHistory } = require('../models/translation-safety.model');

class CleanupService {
  /**
   * Daily Cleanup Job
   * - Delete translation_history older than 90 days
   * - Delete soft-deleted records older than 30 days
   */
  async runDailyCleanup() {
    console.log('[Cleanup] Starting daily maintenance...');
    const now = new Date();
    
    try {
      // 1. Cleanup History (> 90 days)
      const historyCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const historyResult = await TranslationHistory.deleteMany({
        createdAt: { $lt: historyCutoff }
      });
      console.log(`[Cleanup] Removed ${historyResult.deletedCount} stale history snapshots.`);

      // 2. Cleanup Soft-Deleted Records (> 30 days)
      const deleteCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const recordsResult = await PoiContent.deleteMany({
        isDeleted: true,
        deletedAt: { $lt: deleteCutoff }
      });
      console.log(`[Cleanup] Permanently removed ${recordsResult.deletedCount} soft-deleted POI records.`);

      return {
        success: true,
        historyCleaned: historyResult.deletedCount,
        recordsCleaned: recordsResult.deletedCount
      };
    } catch (error) {
      console.error('[Cleanup] Critical error during maintenance:', error);
      throw error;
    }
  }
}

module.exports = new CleanupService();
