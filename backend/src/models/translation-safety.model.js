const mongoose = require('mongoose');

const translationAuditSchema = new mongoose.Schema({
  poiCode: { type: String, required: true, index: true },
  lang_code: { type: String, required: true },
  action: { type: String, enum: ['overwrite', 'delete', 'restore'], required: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  oldVersion: { type: Number },
  newVersion: { type: Number },
  reason: { type: String, required: true },
  diffSnapshot: {
    before: { type: Object },
    after: { type: Object }
  },
  createdAt: { type: Date, default: Date.now }
});

const translationHistorySchema = new mongoose.Schema({
  poiCode: { type: String, required: true, index: true },
  lang_code: { type: String, required: true, index: true },
  version: { type: Number, required: true },
  snapshot: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const translationSessionSchema = new mongoose.Schema({
  poiCode: { type: String, required: true },
  lang_code: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String },
  startedAt: { type: Date, default: Date.now },
  lastHeartbeatAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }
});

translationSessionSchema.index({ poiCode: 1, lang_code: 1 }, { unique: true });

const TranslationAudit = mongoose.model('TranslationAudit', translationAuditSchema);
const TranslationHistory = mongoose.model('TranslationHistory', translationHistorySchema);
const TranslationSession = mongoose.model('TranslationSession', translationSessionSchema);

module.exports = { TranslationAudit, TranslationHistory, TranslationSession };
