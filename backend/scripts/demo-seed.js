#!/usr/bin/env node

/**
 * DEMO SEEDER CLI
 * Usage:
 *   node scripts/demo-seed.js          - Seed demo data
 *   node scripts/demo-seed.js --reset  - Reset demo data
 */

require('dotenv').config();
const mongoose = require('mongoose');
const demoSeeder = require('../src/seeders/demo.seeder');

const args = process.argv.slice(2);
const isReset = args.includes('--reset');

async function run() {
    try {
        console.log('\n========================================');
        console.log('DEMO DATA SEEDER');
        console.log('========================================\n');

        // Connect to database
        console.log('[DEMO CLI] Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('[DEMO CLI] ✅ Database connected\n');

        if (isReset) {
            await demoSeeder.reset();
        } else {
            await demoSeeder.seed();
        }

        console.log('\n[DEMO CLI] ✅ Operation completed successfully!');
        console.log('[DEMO CLI] You can now start the demo.\n');

        process.exit(0);
    } catch (error) {
        console.error('\n[DEMO CLI] ❌ Error:', error.message);
        process.exit(1);
    }
}

run();
