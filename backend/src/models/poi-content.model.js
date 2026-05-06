const mongoose = require('mongoose');

const poiContentSchema = new mongoose.Schema(
  {
    poiCode: {
      type: String,
      required: true,
      index: true
    },
    lang_code: {
      type: String,
      required: true,
      index: true,
      match: /^[a-z]{2}(-[A-Z]{2})?$/
    },
    mode: {
      type: String,
      enum: ['partial', 'full'],
      default: 'partial',
      required: true
    },
    translationSource: {
      type: String,
      enum: ['manual', 'jit_vi', 'jit_en'],
      default: 'manual',
      required: true
    },
    content: {
      name: { type: String, trim: true, default: '' },
      summary: { type: String, default: '' },
      narrationShort: { type: String, default: '' },
      narrationLong: { type: String, default: '' }
    },
    audio: {
      shortId: { type: mongoose.Schema.Types.ObjectId, ref: 'AudioAsset', default: null },
      longId: { type: mongoose.Schema.Types.ObjectId, ref: 'AudioAsset', default: null }
    },
    metadata: {
      isOutdated: { type: Boolean, default: false },
      baseVersionAtUpdate: { type: Number, default: 1 },
      translatedVersion: { type: Number, default: 1 },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      confidenceScore: { type: Number, default: 1.0 } // 1.0 for manual, lower for JIT
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    timestamps: true,
    collection: 'poi_contents'
  }
);

poiContentSchema.index({ poiCode: 1, lang_code: 1 }, { unique: true });

const PoiContent = mongoose.model('PoiContent', poiContentSchema);

module.exports = PoiContent;
