const db = require('./database');
const bcrypt = require('bcryptjs');

async function testLogin() {
    console.log('--- TEST LOGIN STARTED ---');
    try {
        await db.initDatabase();

        const username = 'admin';
        const password = 'admin123';

        console.log(`Attempting login for: ${username}`);
        const user = await db.getUserByUsername(username);

        if (!user) {
            console.log('❌ User not found');
            return;
        }

        console.log(`User found: ${user.username}`);
        console.log(`Stored Hash: ${user.password_hash}`);

        const match = bcrypt.compareSync(password, user.password_hash);
        if (match) {
            console.log('✅ LOGIN SUCCESSFUL (Bcrypt Match)');
        } else {
            console.log('❌ LOGIN FAILED (Bcrypt Mismatch)');
            console.log('This means the password is wrong OR the hash is still broken.');
        }

    } catch (e) {
        console.error('Test Error:', e);
    }
}

testLogin();
