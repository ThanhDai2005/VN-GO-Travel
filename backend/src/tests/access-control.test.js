/**
 * ACCESS CONTROL EDGE CASE TESTS
 * Tests complex scenarios for POI access control
 */

const mongoose = require('mongoose');
const accessControlService = require('../services/access-control.service');
const User = require('../models/user.model');
const Poi = require('../models/poi.model');
const UserUnlockPoi = require('../models/user-unlock-poi.model');
const UserUnlockZone = require('../models/user-unlock-zone.model');
const Zone = require('../models/zone.model');

describe('Access Control Edge Cases', () => {
    let testUser;
    let premiumUser;
    let freePoi;
    let premiumPoi;
    let testZone;

    beforeAll(async () => {
        // Connect to test database
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/vngo_test');
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    beforeEach(async () => {
        // Create test data
        testUser = await User.create({
            email: 'test-access@test.com',
            password: 'test123',
            fullName: 'Test User',
            role: 'user',
            isPremium: false
        });

        premiumUser = await User.create({
            email: 'premium-access@test.com',
            password: 'test123',
            fullName: 'Premium User',
            role: 'user',
            isPremium: true
        });

        freePoi = await Poi.create({
            code: 'TEST_FREE_POI',
            name: 'Test Free POI',
            location: { type: 'Point', coordinates: [105.8542, 21.0285] },
            radius: 100,
            isPremiumOnly: false,
            status: 'approved'
        });

        premiumPoi = await Poi.create({
            code: 'TEST_PREMIUM_POI',
            name: 'Test Premium POI',
            location: { type: 'Point', coordinates: [105.8542, 21.0285] },
            radius: 100,
            isPremiumOnly: true,
            unlockPrice: 100,
            status: 'approved'
        });

        testZone = await Zone.create({
            code: 'TEST_ZONE',
            name: 'Test Zone',
            location: { type: 'Point', coordinates: [105.8542, 21.0285] },
            radius: 5000,
            price: 500,
            poiCodes: ['TEST_PREMIUM_POI'],
            isActive: true
        });
    });

    afterEach(async () => {
        // Clean up test data
        await User.deleteMany({ email: /test-access|premium-access/ });
        await Poi.deleteMany({ code: /TEST_/ });
        await Zone.deleteMany({ code: /TEST_/ });
        await UserUnlockPoi.deleteMany({ userId: { $in: [testUser._id, premiumUser._id] } });
        await UserUnlockZone.deleteMany({ userId: { $in: [testUser._id, premiumUser._id] } });
    });

    describe('Edge Case 1: User buys POI + has zone', () => {
        it('should grant access via zone purchase (not individual POI purchase)', async () => {
            // User purchases zone
            await UserUnlockZone.create({
                userId: testUser._id,
                zoneCode: 'TEST_ZONE',
                purchasePrice: 500
            });

            // Check access
            const result = await accessControlService.checkPoiAccess(testUser._id, premiumPoi.code);

            expect(result.canAccess).toBe(true);
            expect(result.reason).toBe('ZONE_PURCHASED');
            expect(result.requiresPurchase).toBe(false);
        });

        it('should still grant access if user also purchased POI individually', async () => {
            // User purchases zone
            await UserUnlockZone.create({
                userId: testUser._id,
                zoneCode: 'TEST_ZONE',
                purchasePrice: 500
            });

            // User also purchases POI individually (edge case: double purchase)
            await UserUnlockPoi.create({
                userId: testUser._id,
                poiCode: premiumPoi.code,
                purchasePrice: 100
            });

            // Check access - should prioritize POI purchase
            const result = await accessControlService.checkPoiAccess(testUser._id, premiumPoi.code);

            expect(result.canAccess).toBe(true);
            expect(result.reason).toBe('POI_PURCHASED');
        });
    });

    describe('Edge Case 2: Premium + purchased conflict', () => {
        it('should grant access to premium user even if POI is premium-only', async () => {
            // Premium user accessing premium POI
            const result = await accessControlService.checkPoiAccess(premiumUser._id, premiumPoi.code);

            expect(result.canAccess).toBe(true);
            expect(result.reason).toBe('PREMIUM_USER');
            expect(result.requiresPurchase).toBe(false);
        });

        it('should prioritize individual purchase over premium status', async () => {
            // Premium user also purchased POI individually
            await UserUnlockPoi.create({
                userId: premiumUser._id,
                poiCode: premiumPoi.code,
                purchasePrice: 100
            });

            const result = await accessControlService.checkPoiAccess(premiumUser._id, premiumPoi.code);

            expect(result.canAccess).toBe(true);
            expect(result.reason).toBe('POI_PURCHASED');
        });

        it('should grant access to free POI for non-premium user', async () => {
            const result = await accessControlService.checkPoiAccess(testUser._id, freePoi.code);

            expect(result.canAccess).toBe(true);
            expect(result.reason).toBe('FREE_POI');
            expect(result.requiresPurchase).toBe(false);
        });
    });

    describe('Edge Case 3: Unauthorized role escalation attempt', () => {
        it('should deny access to premium POI for non-premium user without purchase', async () => {
            const result = await accessControlService.checkPoiAccess(testUser._id, premiumPoi.code);

            expect(result.canAccess).toBe(false);
            expect(result.reason).toBe('LOCKED');
            expect(result.requiresPurchase).toBe(true);
            expect(result.unlockPrice).toBe(100);
        });

        it('should not allow fake premium status via request manipulation', async () => {
            // Simulate user trying to manipulate isPremium flag
            const fakeUser = { ...testUser.toObject(), isPremium: true };

            // Access control should check DB, not trust user object
            const result = await accessControlService.checkPoiAccess(testUser._id, premiumPoi.code);

            expect(result.canAccess).toBe(false);
            expect(result.reason).toBe('LOCKED');
        });

        it('should deny access to inactive POI even for premium users', async () => {
            // Make POI inactive
            await Poi.findByIdAndUpdate(premiumPoi._id, { status: 'inactive' });

            const result = await accessControlService.checkPoiAccess(premiumUser._id, premiumPoi.code);

            expect(result.canAccess).toBe(false);
            expect(result.reason).toBe('INACTIVE');
        });
    });

    describe('Edge Case 4: Concurrent access checks', () => {
        it('should handle concurrent access checks without race conditions', async () => {
            // Simulate multiple concurrent requests
            const promises = Array(10).fill(null).map(() =>
                accessControlService.checkPoiAccess(testUser._id, freePoi.code)
            );

            const results = await Promise.all(promises);

            // All should return consistent results
            results.forEach(result => {
                expect(result.canAccess).toBe(true);
                expect(result.reason).toBe('FREE_POI');
            });
        });
    });

    describe('Edge Case 5: Zone purchase with multiple POIs', () => {
        it('should grant access to all POIs in purchased zone', async () => {
            // Create another POI in the zone
            const anotherPoi = await Poi.create({
                code: 'TEST_PREMIUM_POI_2',
                name: 'Test Premium POI 2',
                location: { type: 'Point', coordinates: [105.8542, 21.0285] },
                radius: 100,
                isPremiumOnly: true,
                unlockPrice: 100,
                status: 'approved'
            });

            // Update zone to include both POIs
            await Zone.findByIdAndUpdate(testZone._id, {
                poiCodes: ['TEST_PREMIUM_POI', 'TEST_PREMIUM_POI_2']
            });

            // User purchases zone
            await UserUnlockZone.create({
                userId: testUser._id,
                zoneCode: 'TEST_ZONE',
                purchasePrice: 500
            });

            // Check access to both POIs
            const result1 = await accessControlService.checkPoiAccess(testUser._id, premiumPoi.code);
            const result2 = await accessControlService.checkPoiAccess(testUser._id, anotherPoi.code);

            expect(result1.canAccess).toBe(true);
            expect(result1.reason).toBe('ZONE_PURCHASED');
            expect(result2.canAccess).toBe(true);
            expect(result2.reason).toBe('ZONE_PURCHASED');

            // Clean up
            await Poi.deleteOne({ _id: anotherPoi._id });
        });
    });
});
