/**
 * CRITICAL FIX: Reset All User Passwords to 123456
 * This will allow testing of the login flow
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetAllPasswords() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        const db = mongoose.connection.db;

        console.log('=== Resetting All User Passwords ===\n');

        const newPassword = '123456';
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        console.log('New password for all users:', newPassword);
        console.log('Hashed:', hashedPassword.substring(0, 30) + '...\n');

        const users = await db.collection('users').find({}).toArray();

        for (const user of users) {
            await db.collection('users').updateOne(
                { _id: user._id },
                { $set: { password: hashedPassword } }
            );

            console.log('✅ Reset password for:', user.email);
        }

        console.log('\n=== Verification ===');

        // Test one user
        const testUser = await db.collection('users').findOne({ email: 'nva@vngo.com' });
        const match = await bcrypt.compare(newPassword, testUser.password);
        console.log('Test login for nva@vngo.com:', match ? '✅ SUCCESS' : '❌ FAILED');

        console.log('\n✅ All passwords reset to: 123456');

        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

resetAllPasswords();
