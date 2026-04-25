const mongoose = require('mongoose');

const languagePackSchema = new mongoose.Schema(
  {
    language: {
      type: String,
      required: true,
      unique: true,
      index: true,
      match: /^[a-z]{2}$/
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      index: true
    },
    totalSize: {
      type: Number,
      required: true,
      min: 0
    },
    poiCount: {
      type: Number,
      required: true,
      min: 0
    },
    contents: [
      {
        poiCode: {
          type: String,
          required: true
        },
        title: {
          type: String,
          required: true
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
        audioShortUrl: {
          type: String,
          default: null
        },
        audioLongUrl: {
          type: String,
          default: null
        }
      }
    ]
  },
  {
    timestamps: true,
    collection: 'language_packs'
  }
);

const LanguagePack = mongoose.model('LanguagePack', languagePackSchema);

module.exports = LanguagePack;
