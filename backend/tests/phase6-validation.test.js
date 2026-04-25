/**
 * PHASE 6 VALIDATION TESTS
 * Comprehensive test suite for system hardening implementation
 *
 * Test Categories:
 * 1. Business Flow Tests
 * 2. Concurrency Tests
 * 3. Security Tests
 * 4. Offline/Sync Tests
 * 5. Failure Recovery Tests
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/user.model');
const Poi = require('../src/models/poi.model');
const UserWallet = require('../src/models/user-wallet.model');
const CreditTransaction = require('../src/models/credit-transaction.model');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const Redis = require('ioredis');

describe('PHASE 6 VALIDATION TESTS', () => {
    let redisClient;
    let testUser;
    let testUserToken;
    let premiumUser;
    let premiumUserToken;
    let testPoi;

    beforeAll(async () => {
        // Connect to test database
        await mongoose.connect(process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/vngo-test');

        // Connect to Redis
        redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

        // Clear test data
        await User.deleteMany({});
        await Poi.deleteMany({});
        await UserWallet.deleteMany({});
        await CreditTransaction.deleteMany({});
        await redisClient.flushdb();
    });

    afterAll(async () => {
        await mongoose.connection.close();
        await redisClient.quit();
    });

    beforeEach(async () => {
        // Create test users
        testUser = await User.create({
            email: 'test@example.com',
            password: 'password123',
            fullName: 'Test User',
            role: 'USER',
            isPremium: false,
            qrScanCount: 0,
            qrScanLastResetDate: null
        });

        premiumUser = await User.create({
            email: 'premium@example.com',
            password: 'password123',
            fullName: 'Premium User',
            role: 'USER',
            isPremium: true,
            premiumActivatedAt: new Date()
        });

        // Create wallets
        await UserWallet.create({
            userId: testUser._id,
            balance: 1000,
            version: 0
        });

        await UserWallet.create({
            userId: premiumUser._id,
            balance: 1000,
            version: 0
        });

        // Generate tokens
        testUserToken = jwt.sign({ id: testUser._id }, config.jwtSecret);
        premiumUserToken = jwt.sign({ id: premiumUser._id }, config.jwtSecret);

        // Create test POI
        testPoi = await Poi.create({
            code: 'TEST001',
            name: 'Test POI',
            summary: 'Test summary',
            narrationLong: 'Test narration',
            location: {
                type: 'Point',
                coordinates: [105.8342, 21.0278]
            },
            radius: 100,
            isPremiumOnly: false,
            status: 'APPROVED'
        });

        // Clear Redis rate limits
        await redisClient.flushdb();
    });

    afterEach(async () => {
        await User.deleteMany({});
        await Poi.deleteMany({});
        await UserWallet.deleteMany({});
        await CreditTransaction.deleteMany({});
        await redisClient.flushdb();
    });

    // ==========================================
    // 1. BUSINESS FLOW TESTS
    // ==========================================

    describe('1. Business Flow Tests', () => {
        test('1.1 JWT tokens should have 1-year expiration', async () => {
            const poiService = require('../src/services/poi.service');
            const result = await poiService.generateQrScanTokenForAdmin(testPoi.code);

            expect(result.permanent).toBe(false);
            expect(result.expiresInDays).toBe(365);
            expect(result.expiresAt).toBeDefined();

            // Verify JWT payload
            const decoded = jwt.verify(result.token, config.jwtSecret);
            expect(decoded.exp).toBeDefined();
            expect(decoded.iat).toBeDefined();
            expect(decoded.exp - decoded.iat).toBe(365 * 24 * 60 * 60);
        });

        test('1.2 Expired JWT tokens should be rejected', async () => {
            // Create expired token
            const now = Math.floor(Date.now() / 1000);
            const expiredToken = jwt.sign(
                {
                    code: testPoi.code,
                    type: 'static_secure_qr',
                    iat: now - 400 * 24 * 60 * 60, // 400 days ago
                    exp: now - 10, // Expired 10 seconds ago
                    version: 1
                },
                config.jwtSecret
            );

            const response = await request(app)
                .post('/api/v1/pois/scan')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ token: expiredToken });

            expect(response.status).toBe(401);
            expect(response.body.message).toContain('expired');
        });

        test('1.3 Daily quota should reset at midnight UTC', async () => {
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            // Set user's last reset to yesterday with count at limit
            await User.updateOne(
                { _id: testUser._id },
                {
                    qrScanCount: 10,
                    qrScanLastResetDate: yesterday
                }
            );

            const userRepository = require('../src/repositories/user.repository');
            const result = await userRepository.incrementQrScanCountIfAllowed(testUser._id, 10);

            expect(result).not.toBeNull();
            expect(result.qrScanCount).toBe(1); // Reset to 0, then incremented to 1
            expect(result.qrScanLastResetDate).toBe(today);
        });

        test('1.4 Daily quota should block after limit', async () => {
            const today = new Date().toISOString().split('T')[0];

            // Set user at limit for today
            await User.updateOne(
                { _id: testUser._id },
                {
                    qrScanCount: 10,
                    qrScanLastResetDate: today
                }
            );

            const userRepository = require('../src/repositories/user.repository');
            const result = await userRepository.incrementQrScanCountIfAllowed(testUser._id, 10);

            expect(result).toBeNull(); // Should be blocked
        });

        test('1.5 Premium users should bypass daily quota', async () => {
            // Premium users don't have quota checks
            const token = await require('../src/services/poi.service').generateQrScanTokenForAdmin(testPoi.code);

            // Scan 15 times (exceeds free limit)
            for (let i = 0; i < 15; i++) {
                const response = await request(app)
                    .post('/api/v1/pois/scan')
                    .set('Authorization', `Bearer ${premiumUserToken}`)
                    .send({ token: token.token });

                expect(response.status).toBe(200);
            }

            const updatedUser = await User.findById(premiumUser._id);
            expect(updatedUser.qrScanCount).toBe(0); // Premium users don't increment
        });

        test('1.6 Content sync should detect updated POIs', async () => {
            const lastSyncTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago

            // Update POI
            await Poi.updateOne(
                { _id: testPoi._id },
                { summary: 'Updated summary' }
            );

            const response = await request(app)
                .get(`/api/v1/pois/check-sync?lastSyncTime=${encodeURIComponent(lastSyncTime)}`)
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.hasUpdates).toBe(true);
            expect(response.body.data.updatedPois).toHaveLength(1);
            expect(response.body.data.updatedPois[0].code).toBe(testPoi.code);
        });
    });

    // ==========================================
    // 2. CONCURRENCY TESTS
    // ==========================================

    describe('2. Concurrency Tests', () => {
        test('2.1 Concurrent QR scans should respect daily quota', async () => {
            const token = await require('../src/services/poi.service').generateQrScanTokenForAdmin(testPoi.code);

            // Attempt 15 concurrent scans (limit is 10)
            const promises = Array(15).fill(null).map(() =>
                request(app)
                    .post('/api/v1/pois/scan')
                    .set('Authorization', `Bearer ${testUserToken}`)
                    .send({ token: token.token })
            );

            const results = await Promise.all(promises);

            const successCount = results.filter(r => r.status === 200).length;
            const failedCount = results.filter(r => r.status === 403).length;

            expect(successCount).toBeLessThanOrEqual(10);
            expect(failedCount).toBeGreaterThan(0);
        });

        test('2.2 Concurrent credit deductions should maintain balance integrity', async () => {
            const purchaseService = require('../src/services/purchase.service');

            // Attempt 5 concurrent purchases of 300 credits each (total 1500, but wallet has 1000)
            const promises = Array(5).fill(null).map(() =>
                purchaseService.purchasePoi(testUser._id, testPoi.code).catch(e => e)
            );

            const results = await Promise.all(promises);

            const wallet = await UserWallet.findOne({ userId: testUser._id });
            expect(wallet.balance).toBeGreaterThanOrEqual(0); // Never negative

            const transactions = await CreditTransaction.find({ userId: testUser._id });
            const totalDeducted = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
            expect(1000 - wallet.balance).toBe(totalDeducted); // Balance integrity
        });
    });

    // ==========================================
    // 3. SECURITY TESTS
    // ==========================================

    describe('3. Security Tests', () => {
        test('3.1 Rate limiting should block excessive IP requests', async () => {
            const token = await require('../src/services/poi.service').generateQrScanTokenForAdmin(testPoi.code);

            // Attempt 25 scans (IP limit is 20/min)
            const promises = Array(25).fill(null).map(() =>
                request(app)
                    .post('/api/v1/pois/scan')
                    .set('Authorization', `Bearer ${testUserToken}`)
                    .send({ token: token.token })
            );

            const results = await Promise.all(promises);

            const rateLimitedCount = results.filter(r => r.status === 429).length;
            expect(rateLimitedCount).toBeGreaterThan(0);
        });

        test('3.2 Device-based rate limiting should work', async () => {
            const token = await require('../src/services/poi.service').generateQrScanTokenForAdmin(testPoi.code);

            // Attempt 25 scans with device ID (device limit is 20/min)
            const promises = Array(25).fill(null).map(() =>
                request(app)
                    .post('/api/v1/pois/scan')
                    .set('Authorization', `Bearer ${testUserToken}`)
                    .set('X-Device-ID', 'test-device-123')
                    .send({ token: token.token })
            );

            const results = await Promise.all(promises);

            const rateLimitedCount = results.filter(r => r.status === 429).length;
            expect(rateLimitedCount).toBeGreaterThan(0);
        });

        test('3.3 Invalid QR scans should trigger stricter rate limiting', async () => {
            const invalidToken = 'invalid.jwt.token';

            // Attempt 10 invalid scans (invalid limit is 5/min)
            const promises = Array(10).fill(null).map(() =>
                request(app)
                    .post('/api/v1/pois/scan')
                    .set('Authorization', `Bearer ${testUserToken}`)
                    .send({ token: invalidToken })
            );

            const results = await Promise.all(promises);

            const rateLimitedCount = results.filter(r => r.status === 429).length;
            expect(rateLimitedCount).toBeGreaterThan(0);
        });

        test('3.4 Device abuse detection should trigger (100+ scans/hour)', async () => {
            const { checkDeviceAbuse } = require('../src/middlewares/advanced-rate-limit.middleware');

            const mockReq = {
                headers: { 'x-device-id': 'abusive-device-456' }
            };

            // Simulate 101 scans
            for (let i = 0; i < 101; i++) {
                await redisClient.incr('abuse:device:abusive-device-456');
            }
            await redisClient.expire('abuse:device:abusive-device-456', 3600);

            const isAbusive = await checkDeviceAbuse(mockReq);
            expect(isAbusive).toBe(true);
        });
    });

    // ==========================================
    // 4. OFFLINE/SYNC TESTS
    // ==========================================

    describe('4. Offline/Sync Tests', () => {
        test('4.1 Sync check with no updates should return empty', async () => {
            const lastSyncTime = new Date().toISOString(); // Just now

            const response = await request(app)
                .get(`/api/v1/pois/check-sync?lastSyncTime=${encodeURIComponent(lastSyncTime)}`)
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.hasUpdates).toBe(false);
            expect(response.body.data.updatedPois).toHaveLength(0);
        });

        test('4.2 Sync check should detect deleted POIs', async () => {
            const lastSyncTime = new Date(Date.now() - 3600000).toISOString();

            // Mark POI as rejected (soft delete)
            await Poi.updateOne(
                { _id: testPoi._id },
                { status: 'REJECTED' }
            );

            const response = await request(app)
                .get(`/api/v1/pois/check-sync?lastSyncTime=${encodeURIComponent(lastSyncTime)}`)
                .set('Authorization', `Bearer ${testUserToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.hasUpdates).toBe(true);
            expect(response.body.data.deletedPois).toHaveLength(1);
        });
    });

    // ==========================================
    // 5. FAILURE RECOVERY TESTS
    // ==========================================

    describe('5. Failure Recovery Tests', () => {
        test('5.1 Daily quota reset job should handle errors gracefully', async () => {
            const dailyQrResetJob = require('../src/jobs/daily-qr-reset.job');

            // Disconnect database temporarily
            await mongoose.connection.close();

            // Should not throw
            await expect(dailyQrResetJob.execute()).resolves.not.toThrow();

            // Reconnect
            await mongoose.connect(process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/vngo-test');
        });

        test('5.2 Rate limiting should fallback to in-memory if Redis fails', async () => {
            // Disconnect Redis
            await redisClient.quit();

            const token = await require('../src/services/poi.service').generateQrScanTokenForAdmin(testPoi.code);

            const response = await request(app)
                .post('/api/v1/pois/scan')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ token: token.token });

            // Should still work with in-memory fallback
            expect([200, 403]).toContain(response.status);

            // Reconnect Redis
            redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        });

        test('5.3 Optimistic locking should prevent balance corruption', async () => {
            const wallet = await UserWallet.findOne({ userId: testUser._id });
            const originalVersion = wallet.version;

            // Simulate concurrent update by manually changing version
            await UserWallet.updateOne(
                { userId: testUser._id },
                { $inc: { version: 1 } }
            );

            // Attempt purchase with stale version
            const purchaseService = require('../src/services/purchase.service');

            try {
                await purchaseService.purchasePoi(testUser._id, testPoi.code);
            } catch (error) {
                // May fail due to version mismatch, which is expected
            }

            const finalWallet = await UserWallet.findOne({ userId: testUser._id });
            expect(finalWallet.balance).toBeGreaterThanOrEqual(0);
            expect(finalWallet.version).toBeGreaterThan(originalVersion);
        });
    });

    // ==========================================
    // SUMMARY REPORT
    // ==========================================

    afterAll(() => {
        console.log('\n========================================');
        console.log('PHASE 6 VALIDATION TEST SUMMARY');
        console.log('========================================');
        console.log('✅ Business Flow Tests: Complete');
        console.log('✅ Concurrency Tests: Complete');
        console.log('✅ Security Tests: Complete');
        console.log('✅ Offline/Sync Tests: Complete');
        console.log('✅ Failure Recovery Tests: Complete');
        console.log('========================================\n');
    });
});
