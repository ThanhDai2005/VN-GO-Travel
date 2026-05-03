const mongoose = require('mongoose');

/**
 * User Wallet Model
 * Manages user credit balance with optimistic locking
 */

const userWalletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    balance: {
        type: Number,
        required: true,
        default: 100, // Initial free credits (enough for at least one zone purchase)
        min: 0
    },
    currency: {
        type: String,
        default: 'credits',
        enum: ['credits']
    },
    lastTransaction: {
        type: Date,
        default: null
    },
    // Optimistic locking version
    version: {
        type: Number,
        default: 0,
        min: 0
    }
}, {
    timestamps: true
});

// Index for efficient queries
userWalletSchema.index({ userId: 1 });

// Virtual: Has sufficient balance
userWalletSchema.virtual('hasSufficientBalance').get(function() {
    return this.balance > 0;
});

// Method: Deduct credits (with optimistic locking)
userWalletSchema.methods.deductCredits = async function(amount, expectedVersion) {
    if (this.balance < amount) {
        throw new Error('Insufficient credits');
    }

    if (this.version !== expectedVersion) {
        throw new Error('Concurrent modification detected');
    }

    this.balance -= amount;
    this.version += 1;
    this.lastTransaction = new Date();

    return this.save();
};

// Method: Add credits
userWalletSchema.methods.addCredits = async function(amount) {
    this.balance += amount;
    this.version += 1;
    this.lastTransaction = new Date();

    return this.save();
};

// Static: Create wallet for user
userWalletSchema.statics.createForUser = async function(userId, initialBalance = 100) {
    const wallet = await this.create({
        userId,
        balance: initialBalance,
        version: 0
    });

    return wallet;
};

// Static: Get or create wallet
userWalletSchema.statics.getOrCreate = async function(userId, initialBalance = 100) {
    let wallet = await this.findOne({ userId });

    if (!wallet) {
        wallet = await this.createForUser(userId, initialBalance);
    }

    return wallet;
};

const UserWallet = mongoose.model('UserWallet', userWalletSchema);

module.exports = UserWallet;
