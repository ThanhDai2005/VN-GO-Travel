const LanguagePack = require('../models/language-pack.model');
const PoiContent = require('../models/poi-content.model');
const AudioAsset = require('../models/audio-asset.model');

class LanguagePackService {
  /**
   * Get language pack by language
   */
  async getLanguagePack(language) {
    const pack = await LanguagePack.findOne({ language }).lean();
    return pack;
  }

  /**
   * Get language pack version
   */
  async getLanguagePackVersion(language) {
    const pack = await LanguagePack.findOne({ language }).select('version').lean();
    return pack ? pack.version : null;
  }

  /**
   * Get all available language packs
   */
  async getAllLanguagePacks() {
    const packs = await LanguagePack.find({})
      .select('language version totalSize poiCount updatedAt')
      .lean();
    return packs;
  }

  /**
   * Generate or update language pack
   */
  async generateLanguagePack(language) {
    // Get all content for this language
    const contents = await PoiContent.find({ language }).lean();

    if (contents.length === 0) {
      throw new Error(`No content found for language: ${language}`);
    }

    // Build denormalized content array
    const packContents = [];
    let totalSize = 0;

    for (const content of contents) {
      // Get audio URLs if available
      let audioShortUrl = null;
      let audioLongUrl = null;

      if (content.audioShortId) {
        const audioShort = await AudioAsset.findById(content.audioShortId).lean();
        if (audioShort) audioShortUrl = audioShort.url;
      }

      if (content.audioLongId) {
        const audioLong = await AudioAsset.findById(content.audioLongId).lean();
        if (audioLong) audioLongUrl = audioLong.url;
      }

      // Calculate size
      const entrySize = JSON.stringify({
        poiCode: content.poiCode,
        title: content.title,
        description: content.description,
        narrationShort: content.narrationShort,
        narrationLong: content.narrationLong,
        audioShortUrl,
        audioLongUrl
      }).length;

      totalSize += entrySize;

      packContents.push({
        poiCode: content.poiCode,
        title: content.title,
        description: content.description,
        narrationShort: content.narrationShort,
        narrationLong: content.narrationLong,
        audioShortUrl,
        audioLongUrl
      });
    }

    // Check if pack exists
    const existingPack = await LanguagePack.findOne({ language });

    if (existingPack) {
      // Update existing pack
      existingPack.version += 1;
      existingPack.totalSize = totalSize;
      existingPack.poiCount = packContents.length;
      existingPack.contents = packContents;
      await existingPack.save();
      return existingPack;
    } else {
      // Create new pack
      const pack = new LanguagePack({
        language,
        version: 1,
        totalSize,
        poiCount: packContents.length,
        contents: packContents
      });
      await pack.save();
      return pack;
    }
  }

  /**
   * Delete language pack
   */
  async deleteLanguagePack(language) {
    const result = await LanguagePack.deleteOne({ language });
    return result.deletedCount > 0;
  }

  /**
   * Check if language pack needs update
   */
  async needsUpdate(language) {
    const pack = await LanguagePack.findOne({ language }).lean();
    if (!pack) return true;

    // Check if content count changed
    const contentCount = await PoiContent.countDocuments({ language });
    if (contentCount !== pack.poiCount) return true;

    // Check if any content was updated after pack
    const recentContent = await PoiContent.findOne({
      language,
      updatedAt: { $gt: pack.updatedAt }
    });

    return !!recentContent;
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    const totalPacks = await LanguagePack.countDocuments({});
    const packs = await LanguagePack.find({}).lean();

    const totalSize = packs.reduce((sum, pack) => sum + pack.totalSize, 0);
    const totalPois = packs.reduce((sum, pack) => sum + pack.poiCount, 0);

    return {
      totalPacks,
      totalSize,
      averagePackSize: totalPacks > 0 ? totalSize / totalPacks : 0,
      totalPois,
      packs: packs.map(p => ({
        language: p.language,
        version: p.version,
        size: p.totalSize,
        poiCount: p.poiCount,
        updatedAt: p.updatedAt
      }))
    };
  }
}

module.exports = new LanguagePackService();
