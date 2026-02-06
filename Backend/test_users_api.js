const db = require('./database');

async function testUsers() {
    console.log('--- TEST GET ALL USERS ---');
    try {
        await db.initDatabase();
        const users = await db.getAllUsers();
        console.log(`Retrieved ${users.length} users.`);
        if (users.length > 0) {
            console.log('Sample User:', users[0]);
            if (users[0].password_hash) {
                console.error('❌ SECURITY FAIL: Password hash returned!');
            } else {
                console.log('✅ Security Pass: No password hash exposed.');
            }
        } else {
            console.log('⚠️ No users found.');
        }

    } catch (e) {
        console.error('Test Error:', e);
    }
}

testUsers();
