const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const Poi = require('../models/poi.model');
const Zone = require('../models/zone.model');
const UserWallet = require('../models/user-wallet.model');
const CreditTransaction = require('../models/credit-transaction.model');
const UserUnlockPoi = require('../models/user-unlock-poi.model');
const UserUnlockZone = require('../models/user-unlock-zone.model');
const { POI_STATUS } = require('../constants/poi-status');
const { ROLES } = require('../constants/roles');

/**
 * DEMO DATA SEEDER
 * Creates a complete demo scenario with:
 * - Demo user with credits
 * - Sample zones and POIs
 * - Pre-unlocked content
 * - Analytics data
 */

class DemoSeeder {
    async seed() {
        console.log('[DEMO SEEDER] Starting demo data creation...');

        try {
            // Clear existing demo data
            await this.clearDemoData();

            // Create demo users
            const demoUser = await this.createDemoUser();
            const adminUser = await this.createAdminUser();
            const ownerUser = await this.createOwnerUser();

            // Create zones
            const zones = await this.createZones();

            // Create POIs
            const pois = await this.createPOIs(zones);

            // Setup user wallet with credits
            await this.setupWallet(demoUser);

            // Pre-unlock one zone for smooth demo
            await this.preUnlockZone(demoUser, zones[0]);

            // Create sample analytics data
            await this.createAnalyticsData(demoUser, pois);

            console.log('[DEMO SEEDER] ✅ Demo data created successfully!');
            console.log('\n========================================');
            console.log('DEMO CREDENTIALS');
            console.log('========================================');
            console.log('Demo User:');
            console.log('  Email: demo@vngo.com');
            console.log('  Password: demo123');
            console.log('  Credits: 5000');
            console.log('\nAdmin User:');
            console.log('  Email: admin@vngo.com');
            console.log('  Password: admin123');
            console.log('\nOwner User (Chủ POI):');
            console.log('  Email: owner@vngo.com');
            console.log('  Password: owner123');
            console.log('========================================\n');

            return {
                demoUser,
                adminUser,
                ownerUser,
                zones,
                pois
            };
        } catch (error) {
            console.error('[DEMO SEEDER] ❌ Error creating demo data:', error);
            throw error;
        }
    }

    async clearDemoData() {
        console.log('[DEMO SEEDER] Clearing existing demo data...');

        // Delete demo users
        await User.deleteMany({ email: { $in: ['demo@vngo.com', 'admin@vngo.com', 'owner@vngo.com'] } });

        // Delete demo zones (starting with DEMO_)
        const demoZones = await Zone.find({ code: /^DEMO_/ });
        const demoZoneIds = demoZones.map(z => z._id);
        await Zone.deleteMany({ _id: { $in: demoZoneIds } });

        // Delete demo POIs (starting with DEMO_)
        await Poi.deleteMany({ code: /^DEMO_/ });

        // Delete related data
        const demoUsers = await User.find({ email: { $in: ['demo@vngo.com', 'admin@vngo.com', 'owner@vngo.com'] } });
        const demoUserIds = demoUsers.map(u => u._id);

        await UserWallet.deleteMany({ userId: { $in: demoUserIds } });
        await CreditTransaction.deleteMany({ userId: { $in: demoUserIds } });
        await UserUnlockPoi.deleteMany({ userId: { $in: demoUserIds } });
        await UserUnlockZone.deleteMany({ userId: { $in: demoUserIds } });

        console.log('[DEMO SEEDER] ✅ Demo data cleared');
    }

    async createDemoUser() {
        console.log('[DEMO SEEDER] Creating demo user...');

        const user = await User.create({
            email: 'demo@vngo.com',
            password: 'demo123',
            fullName: 'Demo User',
            role: ROLES.USER,
            isPremium: false,
            isActive: true,
            qrScanCount: 0
        });

        console.log('[DEMO SEEDER] ✅ Demo user created');
        return user;
    }

    async createAdminUser() {
        console.log('[DEMO SEEDER] Creating admin user...');

        const user = await User.create({
            email: 'admin@vngo.com',
            password: 'admin123',
            fullName: 'Admin User',
            role: ROLES.ADMIN,
            isPremium: true,
            premiumActivatedAt: new Date(),
            isActive: true
        });

        console.log('[DEMO SEEDER] ✅ Admin user created');
        return user;
    }

    async createOwnerUser() {
        console.log('[DEMO SEEDER] Creating owner user (POI owner)...');

        const user = await User.create({
            email: 'owner@vngo.com',
            password: 'owner123',
            fullName: 'POI Owner',
            role: ROLES.OWNER,
            isPremium: false,
            isActive: true
        });

        console.log('[DEMO SEEDER] ✅ Owner user created');
        return user;
    }

    async createZones() {
        console.log('[DEMO SEEDER] Creating demo zones...');

        const zones = await Zone.insertMany([
            {
                code: 'DEMO_HANOI_OLD_QUARTER',
                name: 'Hanoi Old Quarter',
                description: 'Historic heart of Hanoi with ancient streets and traditional architecture',
                location: {
                    type: 'Point',
                    coordinates: [105.8516, 21.0355] // Hoan Kiem Lake area
                },
                radius: 2000,
                price: 500,
                isPremiumOnly: false
            },
            {
                code: 'DEMO_HCMC_DISTRICT1',
                name: 'Ho Chi Minh City District 1',
                description: 'Modern downtown with colonial landmarks and vibrant culture',
                location: {
                    type: 'Point',
                    coordinates: [106.7008, 10.7756] // Ben Thanh Market area
                },
                radius: 2000,
                price: 500,
                isPremiumOnly: false
            }
        ]);

        console.log('[DEMO SEEDER] ✅ Created 2 zones');
        return zones;
    }

    async createPOIs(zones) {
        console.log('[DEMO SEEDER] Creating demo POIs...');

        const pois = await Poi.insertMany([
            // Hanoi Old Quarter POIs
            {
                code: 'DEMO_HOAN_KIEM_LAKE',
                name: 'Hồ Hoàn Kiếm',
                summary: 'Iconic lake in the heart of Hanoi, symbol of the city',
                narrationShort: 'Hồ Hoàn Kiếm là biểu tượng của Hà Nội',
                narrationLong: 'Hồ Hoàn Kiếm, hay còn gọi là Hồ Gươm, là một hồ nước ngọt tự nhiên nằm ở trung tâm thành phố Hà Nội. Hồ có diện tích khoảng 12 héc-ta, là địa điểm du lịch nổi tiếng và là biểu tượng văn hóa của thủ đô.',
                location: {
                    type: 'Point',
                    coordinates: [105.8522, 21.0285]
                },
                radius: 300,
                priority: 1,
                languageCode: 'vi',
                isPremiumOnly: false,
                status: POI_STATUS.APPROVED,
                zoneId: zones[0]._id
            },
            {
                code: 'DEMO_NGOC_SON_TEMPLE',
                name: 'Đền Ngọc Sơn',
                summary: 'Ancient temple on Hoan Kiem Lake',
                narrationShort: 'Đền Ngọc Sơn là ngôi đền cổ trên Hồ Hoàn Kiếm',
                narrationLong: 'Đền Ngọc Sơn được xây dựng vào thế kỷ 18, nằm trên đảo Ngọc ở Hồ Hoàn Kiếm. Đền thờ Trần Hưng Đạo, La Tổ và Văn Xương Đế Quân. Đây là một trong những di tích lịch sử quan trọng của Hà Nội.',
                location: {
                    type: 'Point',
                    coordinates: [105.8525, 21.0290]
                },
                radius: 100,
                priority: 2,
                languageCode: 'vi',
                isPremiumOnly: false,
                status: POI_STATUS.APPROVED,
                zoneId: zones[0]._id
            },
            {
                code: 'DEMO_DONG_XUAN_MARKET',
                name: 'Chợ Đồng Xuân',
                summary: 'Largest covered market in Hanoi',
                narrationShort: 'Chợ Đồng Xuân là chợ lớn nhất Hà Nội',
                narrationLong: 'Chợ Đồng Xuân được xây dựng từ năm 1889, là chợ đầu mối lớn nhất Hà Nội. Chợ có 3 tầng với hàng nghìn gian hàng bán đủ loại mặt hàng từ quần áo, đồ gia dụng đến thực phẩm.',
                location: {
                    type: 'Point',
                    coordinates: [105.8490, 21.0365]
                },
                radius: 200,
                priority: 3,
                languageCode: 'vi',
                isPremiumOnly: false,
                status: POI_STATUS.APPROVED,
                zoneId: zones[0]._id
            },

            // HCMC District 1 POIs
            {
                code: 'DEMO_BEN_THANH_MARKET',
                name: 'Chợ Bến Thành',
                summary: 'Historic market and symbol of Ho Chi Minh City',
                narrationShort: 'Chợ Bến Thành là biểu tượng của Sài Gòn',
                narrationLong: 'Chợ Bến Thành được xây dựng từ năm 1912, là một trong những công trình kiến trúc cổ nhất còn lại ở Sài Gòn. Chợ có hơn 3000 gian hàng, là điểm đến không thể bỏ qua khi đến thành phố Hồ Chí Minh.',
                location: {
                    type: 'Point',
                    coordinates: [106.6981, 10.7720]
                },
                radius: 200,
                priority: 1,
                languageCode: 'vi',
                isPremiumOnly: false,
                status: POI_STATUS.APPROVED,
                zoneId: zones[1]._id
            },
            {
                code: 'DEMO_NOTRE_DAME_CATHEDRAL',
                name: 'Nhà thờ Đức Bà',
                summary: 'Neo-Romanesque cathedral built by French colonists',
                narrationShort: 'Nhà thờ Đức Bà là công trình kiến trúc Pháp nổi tiếng',
                narrationLong: 'Nhà thờ Đức Bà Sài Gòn được xây dựng từ 1863 đến 1880 theo phong cách kiến trúc Neo-Romanesque. Nhà thờ cao 60 mét, được xây bằng gạch đỏ nhập từ Marseille, Pháp.',
                location: {
                    type: 'Point',
                    coordinates: [106.6990, 10.7797]
                },
                radius: 150,
                priority: 2,
                languageCode: 'vi',
                isPremiumOnly: false,
                status: POI_STATUS.APPROVED,
                zoneId: zones[1]._id
            }
        ]);

        // Link POIs to zones (first 3 POIs = Hanoi, last 2 = HCMC)
        await Zone.findByIdAndUpdate(zones[0]._id, {
            poiCodes: ['DEMO_HOAN_KIEM_LAKE', 'DEMO_NGOC_SON_TEMPLE', 'DEMO_DONG_XUAN_MARKET']
        });

        await Zone.findByIdAndUpdate(zones[1]._id, {
            poiCodes: ['DEMO_BEN_THANH_MARKET', 'DEMO_NOTRE_DAME_CATHEDRAL']
        });

        console.log('[DEMO SEEDER] ✅ Created 5 POIs and linked to zones');
        return pois;
    }

    async setupWallet(user) {
        console.log('[DEMO SEEDER] Setting up demo wallet...');

        const wallet = await UserWallet.create({
            userId: user._id,
            balance: 5000,
            version: 0
        });

        // Create initial credit transaction
        await CreditTransaction.create({
            userId: user._id,
            type: 'initial_bonus',
            amount: 5000,
            balanceBefore: 0,
            balanceAfter: 5000,
            relatedEntity: null,
            metadata: { source: 'demo_seeder', reason: 'Initial demo credits' }
        });

        console.log('[DEMO SEEDER] ✅ Wallet created with 5000 credits');
        return wallet;
    }

    async preUnlockZone(user, zone) {
        console.log('[DEMO SEEDER] Pre-unlocking zone for smooth demo...');

        await UserUnlockZone.create({
            userId: user._id,
            zoneCode: zone.code,
            purchasePrice: 0 // Free for demo
        });

        console.log(`[DEMO SEEDER] ✅ Zone "${zone.name}" unlocked`);
    }

    async createAnalyticsData(user, pois) {
        console.log('[DEMO SEEDER] Creating sample analytics data...');

        // Skip creating fake analytics data - real data will be generated from actual usage
        // CreditTransaction only supports: purchase_poi, purchase_zone, admin_grant, refund, initial_bonus

        console.log('[DEMO SEEDER] ✅ Analytics data skipped (will be generated from real usage)');
    }

    async reset() {
        console.log('[DEMO SEEDER] Resetting demo data...');
        await this.clearDemoData();
        console.log('[DEMO SEEDER] ✅ Demo data reset complete');
    }
}

module.exports = new DemoSeeder();
