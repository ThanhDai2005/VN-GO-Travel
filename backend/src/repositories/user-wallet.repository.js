const UserWallet = require('../models/user-wallet.model');
const CreditTransaction = require('../models/credit-transaction.model');
const { AppError } = require('../middlewares/error.middleware');

/**
 * User Wallet Repository
 * Handles wallet operations with optimistic locking
 */

class UserWalletRepository {
    /**
     * Find wallet by user ID
     */
    async findByUserId(userId) {
        const wallet = await UserWallet.findOne({ userId });
        return wallet;
    }

    /**
     * Get or create wallet for user
     */
    async getOrCreate(userId, initialBalance = 100) {
        let wallet = await this.findByUserId(userId);

        if (!wallet) {
            wallet = await UserWallet.createForUser(userId, initialBalance);

            // Record initial bonus transaction
            await CreditTransaction.record({
                userId,
                type: 'initial_bonus',
                amount: initialBalance,
                balanceBefore: 0,
                balanceAfter: initialBalance,
                metadata: { reason: 'Welcome bonus' }
            });

            console.log(`[WALLET] Created wallet for user ${userId} with ${initialBalance} credits`);
        }

        return wallet;
    }

    /**
     * Deduct credits atomically with optimistic locking
     * Returns updated wallet or null if version mismatch
     */
    async deductCreditsAtomic(userId, amount, expectedVersion, options = {}) {
        try {
            const result = await UserWallet.findOneAndUpdate(
                {
                    userId,
                    version: expectedVersion,
                    balance: { $gte: amount } // Ensure sufficient balance
                },
                {
                    $inc: { balance: -amount, version: 1 },
                    $set: { lastTransaction: new Date() }
                },
                {
                    new: true,
                    ...options
                }
            );

            if (!result) {
                console.warn(`[WALLET] Atomic deduction failed for user ${userId}: version mismatch or insufficient balance`);
            }

            return result;
        } catch (error) {
            console.error('[WALLET] Deduct credits error:', error);
            throw new AppError('Failed to deduct credits', 500);
        }
    }

    /**
     * Add credits to wallet
     */
    async addCredits(userId, amount, reason = 'Admin grant', options = {}) {
        try {
            const wallet = await this.getOrCreate(userId);
            const balanceBefore = wallet.balance;

            await wallet.addCredits(amount);

            // Record transaction
            await CreditTransaction.record({
                userId,
                type: 'admin_grant',
                amount,
                balanceBefore,
                balanceAfter: wallet.balance,
                metadata: { reason }
            }, options);

            console.log(`[WALLET] Added ${amount} credits to user ${userId}. New balance: ${wallet.balance}`);

            return wallet;
        } catch (error) {
            console.error('[WALLET] Add credits error:', error);
            throw new AppError('Failed to add credits', 500);
        }
    }

    /**
     * Get wallet balance
     */
    async getBalance(userId) {
        const wallet = await this.getOrCreate(userId);
        return wallet.balance;
    }

    /**
     * Check if user has sufficient balance
     */
    async hasSufficientBalance(userId, amount) {
        const wallet = await this.getOrCreate(userId);
        return wallet.balance >= amount;
    }
}

module.exports = new UserWalletRepository();
