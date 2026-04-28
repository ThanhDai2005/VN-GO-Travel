require('dotenv').config();
const mongoose = require('mongoose');
const seeder = require('./src/seeders/demo.seeder');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    await seeder.seed();
    process.exit(0);
}
run();
