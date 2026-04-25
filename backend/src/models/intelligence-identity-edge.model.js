const mongoose = require('mongoose');

const intelligenceIdentityEdgeSchema = new mongoose.Schema(
  {
    edge_type: {
      type: String,
      required: true,
      enum: ['device_linked_user'],
      default: 'device_linked_user'
    },
    from_id: {
      type: String,
      required: true,
      index: true
    },
    to_id: {
      type: String,
      required: true,
      index: true
    },
    established_at: {
      type: Date,
      required: true,
      default: () => new Date()
    },
    source: {
      type: String,
      required: true,
      enum: ['ingest_jwt', 'ingest_api_key'],
      default: 'ingest_jwt'
    },
    confidence: {
      type: String,
      required: true,
      enum: ['high', 'medium'],
      default: 'high'
    },
    ingestion_request_id: {
      type: String,
      default: null
    }
  },
  {
    timestamps: false,
    collection: 'uis_identity_edges'
  }
);

// Spec-required indexes (v7.3.2 §6)
intelligenceIdentityEdgeSchema.index(
  { edge_type: 1, from_id: 1, to_id: 1 },
  { unique: true, partialFilterExpression: { edge_type: 'device_linked_user' } }
);

intelligenceIdentityEdgeSchema.index({ to_id: 1, established_at: -1 });
intelligenceIdentityEdgeSchema.index({ from_id: 1, established_at: -1 });

module.exports = mongoose.model('IntelligenceIdentityEdge', intelligenceIdentityEdgeSchema);
