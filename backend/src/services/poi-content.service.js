const PoiContent = require('../models/poi-content.model');

class PoiContentService {
  /**
   * Get content for a POI in a specific language
   * Falls back to Vietnamese if requested language not found
   */
  async getContent(poiCode, language = 'vi') {
    // Try requested language
    let content = await PoiContent.findOne({ poiCode, language }).lean();

    // Fallback to Vietnamese
    if (!content && language !== 'vi') {
      content = await PoiContent.findOne({ poiCode, language: 'vi' }).lean();
    }

    return content;
  }

  /**
   * Get all content for a POI (all languages)
   */
  async getAllContentForPoi(poiCode) {
    const contents = await PoiContent.find({ poiCode }).lean();
    return contents;
  }

  /**
   * Create new content entry
   */
  async createContent(contentData) {
    const content = new PoiContent(contentData);
    await content.save();
    return content;
  }

  /**
   * Update existing content
   */
  async updateContent(poiCode, language, updates) {
    const content = await PoiContent.findOne({ poiCode, language });

    if (!content) {
      throw new Error(`Content not found for ${poiCode} (${language})`);
    }

    // Update fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        content[key] = updates[key];
      }
    });

    // Increment version
    content.version += 1;

    await content.save();
    return content;
  }

  /**
   * Delete content entry
   */
  async deleteContent(poiCode, language) {
    const result = await PoiContent.deleteOne({ poiCode, language });
    return result.deletedCount > 0;
  }

  /**
   * Get all available languages for a POI
   */
  async getAvailableLanguages(poiCode) {
    const contents = await PoiContent.find({ poiCode }).select('language').lean();
    return contents.map(c => c.language);
  }

  /**
   * Check if content exists
   */
  async contentExists(poiCode, language) {
    const count = await PoiContent.countDocuments({ poiCode, language });
    return count > 0;
  }

  /**
   * Get content with audio URLs populated
   */
  async getContentWithAudio(poiCode, language = 'vi') {
    let content = await PoiContent.findOne({ poiCode, language })
      .populate('audioShortId')
      .populate('audioLongId')
      .lean();

    // Fallback to Vietnamese
    if (!content && language !== 'vi') {
      content = await PoiContent.findOne({ poiCode, language: 'vi' })
        .populate('audioShortId')
        .populate('audioLongId')
        .lean();
    }

    return content;
  }

  /**
   * Link audio asset to content
   */
  async linkAudio(poiCode, language, audioType, audioAssetId) {
    const content = await PoiContent.findOne({ poiCode, language });

    if (!content) {
      throw new Error(`Content not found for ${poiCode} (${language})`);
    }

    if (audioType === 'short') {
      content.audioShortId = audioAssetId;
    } else if (audioType === 'long') {
      content.audioLongId = audioAssetId;
    } else {
      throw new Error(`Invalid audio type: ${audioType}`);
    }

    content.version += 1;
    await content.save();

    return content;
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    const totalContent = await PoiContent.countDocuments({});
    const languages = await PoiContent.distinct('language');
    const poisWithContent = await PoiContent.distinct('poiCode');

    const languageStats = await PoiContent.aggregate([
      { $group: { _id: '$language', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    return {
      totalContent,
      totalLanguages: languages.length,
      totalPois: poisWithContent.length,
      languages: languageStats.map(l => ({ language: l._id, count: l.count }))
    };
  }
}

module.exports = new PoiContentService();
