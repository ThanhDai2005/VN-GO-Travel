require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user.model');
const { ROLES } = require('./constants/roles');
const { POI_STATUS } = require('./constants/poi-status');
const Poi = require('./models/poi.model');
const PoiRequest = require('./models/poi-request.model');
const AdminPoiAudit = require('./models/admin-poi-audit.model');
const connectDB = require('./config/db');

const pois = [
    {
        code: 'VNM-SGN-001',
        name: 'Ben Thanh Market',
        location: {
            type: 'Point',
            coordinates: [106.7019, 10.7769] // Ben Thanh Market, HCM
        },
        content: {
            vi: 'Chợ Bến Thành',
            en: 'Ben Thanh Market'
        },
        isPremiumOnly: false,
        status: POI_STATUS.APPROVED,
        submittedBy: null
    },
    {
        code: 'VNM-SGN-002',
        name: 'Independence Palace',
        location: {
            type: 'Point',
            coordinates: [106.6991, 10.7772] // Independence Palace, HCM
        },
        content: {
            vi: 'Dinh Độc Lập',
            en: 'Independence Palace'
        },
        isPremiumOnly: false,
        status: POI_STATUS.APPROVED,
        submittedBy: null
    },
    {
        code: 'VNM-HAN-001',
        name: 'Hoan Kiem Lake',
        location: {
            type: 'Point',
            coordinates: [105.8522, 21.0285] // Hoan Kiem Lake, Hanoi
        },
        content: {
            vi: 'Hồ Hoàn Kiếm',
            en: 'Hoan Kiem Lake'
        },
        isPremiumOnly: false,
        status: POI_STATUS.APPROVED,
        submittedBy: null
    },
    {
        code: 'VNM-DNG-001',
        name: 'Dragon Bridge',
        location: {
            type: 'Point',
            coordinates: [108.2022, 16.0544] // Dragon Bridge, Da Nang
        },
        content: {
            vi: 'Cầu Rồng',
            en: 'Dragon Bridge'
        },
        isPremiumOnly: true, // Premium example
        status: POI_STATUS.APPROVED,
        submittedBy: null
    },
    {
        code: 'VNM-HUI-001',
        name: 'Hue Imperial City',
        location: {
            type: 'Point',
            coordinates: [107.5791, 16.4637] // Hue Imperial City
        },
        content: {
            vi: 'Đại Nội Huế',
            en: 'Hue Imperial City'
        },
        isPremiumOnly: false,
        status: POI_STATUS.APPROVED,
        submittedBy: null
    }
];

const seedData = async () => {
    try {
        await connectDB();

        // Clear existing
        await User.deleteMany();
        await Poi.deleteMany();
        await PoiRequest.deleteMany();
        const Zone = require('./models/zone.model');
        await Zone.deleteMany();
        // Dev-only reset. Production must not wipe audit history.
        await AdminPoiAudit.deleteMany();

        await User.create({
            email: 'test@vngo.com',
            password: 'password123',
            role: ROLES.USER,
            isPremium: false
        });
        await User.create({
            email: 'admin@vngo.com',
            password: 'password123',
            role: ROLES.ADMIN,
            isPremium: false
        });
        await User.create({
            email: 'owner@vngo.com',
            password: 'password123',
            role: ROLES.OWNER,
            isPremium: false
        });

        console.log('Created test users: test@vngo.com, admin@vngo.com, owner@vngo.com (password: password123)');

        // Create POIs
        await Poi.insertMany(pois);
        
        console.log('Seeded 5 sample POIs in Vietnam');

        process.exit();
    } catch (error) {
        console.error('Error with seed data:', error);
        process.exit(1);
    }
};

seedData();
