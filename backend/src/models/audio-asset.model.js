const mongoose = require('mongoose');

const audioAssetSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true
    },
    duration: {
      type: Number,
      required: true,
      min: 0
    },
    language: {
      type: String,
      required: true,
      index: true,
      match: /^[a-z]{2}$/
    },
    format: {
      type: String,
      required: true,
      enum: ['mp3', 'ogg', 'wav', 'm4a'],
      default: 'mp3'
    },
    fileSize: {
      type: Number,
      required: true,
      min: 0
    },
    checksum: {
      type: String,
      required: true,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'audio_assets'
  }
);

const AudioAsset = mongoose.model('AudioAsset', audioAssetSchema);

module.exports = AudioAsset;
