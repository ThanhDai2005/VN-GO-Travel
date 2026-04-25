const mongoose = require('mongoose');

const poiContentSchema = new mongoose.Schema(
  {
    poiCode: {
      type: String,
      required: true,
      index: true
    },
    language: {
      type: String,
      required: true,
      index: true,
      match: /^[a-z]{2}$/
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    narrationShort: {
      type: String,
      required: true
    },
    narrationLong: {
      type: String,
      required: true
    },
    audioShortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AudioAsset',
      default: null
    },
    audioLongId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AudioAsset',
      default: null
    },
    version: {
      type: Number,
      default: 1,
      min: 1
    }
  },
  {
    timestamps: true,
    collection: 'poi_contents'
  }
);

poiContentSchema.index({ poiCode: 1, language: 1 }, { unique: true });

const PoiContent = mongoose.model('PoiContent', poiContentSchema);

module.exports = PoiContent;
