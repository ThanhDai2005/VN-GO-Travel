const mongoose = require('mongoose');

/**
 * Credit Transaction Model
 * Audit trail for all credit operations
 */

const creditTransactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: ['purchase_poi', 'purchase_zone', 'admin_grant', 'refund', 'initial_bonus'],
        index: true
    },
    amount: {
        type: Number,
        required: true
        // Negative for deductions, positive for additions
    },
    balanceBefore: {
        type: Number,
        required: true,
        min: 0
    },
    balanceAfter: {
        type: Number,
        required: true,
        min: 0
    },
    relatedEntity: {
        type: String,
        default: null
        // poiCode or zoneCode
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
        // Additional context (admin notes, refund reason, etc.)
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false // Only use createdAt
});

// Indexes for efficient queries
creditTransactionSchema.index({ userId: 1, createdAt: -1 });
creditTransactionSchema.index({ type: 1, createdAt: -1 });
creditTransactionSchema.index({ userId: 1, type: 1, createdAt: -1 });

// Static: Record transaction
creditTransactionSchema.statics.record = async function(data, options = {}) {
    const transaction = await this.create([{
        userId: data.userId,
        type: data.type,
        amount: data.amount,
        balanceBefore: data.balanceBefore,
        balanceAfter: data.balanceAfter,
        relatedEntity: data.relatedEntity || null,
        metadata: data.metadata || {},
        createdAt: new Date()
    }], options);

    return transaction[0];
};

// Static: Get user transaction history
creditTransactionSchema.statics.getUserHistory = async function(userId, limit = 50) {
    return await this.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit);
};

// Static: Get transaction statistics
creditTransactionSchema.statics.getStats = async function(userId) {
    const transactions = await this.find({ userId });

    const totalSpent = transactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalEarned = transactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);

    const purchaseCount = transactions.filter(t =>
        t.type === 'purchase_poi' || t.type === 'purchase_zone'
    ).length;

    return {
        totalTransactions: transactions.length,
        totalSpent,
        totalEarned,
        purchaseCount
    };
};

const CreditTransaction = mongoose.model('CreditTransaction', creditTransactionSchema);

module.exports = CreditTransaction;
