const AudioAsset = require('../models/audio-asset.model');

class AudioAssetService {
  /**
   * Create new audio asset
   */
  async createAudioAsset(assetData) {
    const asset = new AudioAsset(assetData);
    await asset.save();
    return asset;
  }

  /**
   * Get audio asset by ID
   */
  async getAudioAsset(assetId) {
    const asset = await AudioAsset.findById(assetId).lean();
    return asset;
  }

  /**
   * Get audio assets by language
   */
  async getAudioAssetsByLanguage(language) {
    const assets = await AudioAsset.find({ language }).lean();
    return assets;
  }

  /**
   * Update audio asset
   */
  async updateAudioAsset(assetId, updates) {
    const asset = await AudioAsset.findById(assetId);

    if (!asset) {
      throw new Error(`Audio asset not found: ${assetId}`);
    }

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        asset[key] = updates[key];
      }
    });

    await asset.save();
    return asset;
  }

  /**
   * Delete audio asset
   */
  async deleteAudioAsset(assetId) {
    const result = await AudioAsset.deleteOne({ _id: assetId });
    return result.deletedCount > 0;
  }

  /**
   * Find audio asset by checksum
   */
  async findByChecksum(checksum) {
    const asset = await AudioAsset.findOne({ checksum }).lean();
    return asset;
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    const totalAssets = await AudioAsset.countDocuments({});
    const languages = await AudioAsset.distinct('language');

    const languageStats = await AudioAsset.aggregate([
      { $group: { _id: '$language', count: { $sum: 1 }, totalSize: { $sum: '$fileSize' } } },
      { $sort: { count: -1 } }
    ]);

    const formatStats = await AudioAsset.aggregate([
      { $group: { _id: '$format', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    return {
      totalAssets,
      totalLanguages: languages.length,
      languages: languageStats.map(l => ({
        language: l._id,
        count: l.count,
        totalSize: l.totalSize
      })),
      formats: formatStats.map(f => ({ format: f._id, count: f.count }))
    };
  }
}

module.exports = new AudioAssetService();
