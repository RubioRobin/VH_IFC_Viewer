const fs = require('fs');
const db = require('./database');
const bcrypt = require('bcryptjs');

async function debugAuth() {
    const result = { logs: [] };
    const log = (msg) => result.logs.push(msg);

    try {
        log('--- DEBUG AUTH STARTED ---');
        // Capture console.log from initDatabase if possible, or just ignore
        await db.initDatabase();

        const username = 'admin';
        const passwordStart = 'admin123';

        log(`Fetching user: ${username}`);
        const user = await db.getUserByUsername(username);

        if (!user) {
            log('❌ User not found in DB!');
        } else {
            log('✅ User found in DB');
            log(`ID: ${user.id}`);
            log(`Role: ${user.role}`);

            const storedHash = user.password_hash;
            // Reveal the hash to see if it's plain text or malformed
            log(`Stored Password Hash: ${storedHash}`);
            log(`Stored Hash Length: ${storedHash ? storedHash.length : 0}`);

            // Check 1: Is it plaintext?
            if (storedHash === passwordStart) {
                log('⚠️  CRITICAL: Stored password IS PLAINTEXT!');
            } else {
                log('Info: Stored password is NOT plaintext.');
            }

            // Check 2: Bcrypt Compare
            log(`Attempting bcrypt.compare('${passwordStart}', storedHash)...`);
            const match = bcrypt.compareSync(passwordStart, storedHash);
            log(`Result: ${match ? '✅ MATCH' : '❌ NO MATCH'}`);

            // Check 3: Check if it is a valid bcrypt hash format
            const isBcrypt = storedHash && storedHash.startsWith('$2');
            log(`Is valid bcrypt format (starts with $2): ${isBcrypt}`);

            // Check 4: Generate new hash and compare
            const newHash = bcrypt.hashSync(passwordStart, 10);
            log(`Generated NEW hash for same password: ${newHash}`);
            log(`Compare new hash with password: ${bcrypt.compareSync(passwordStart, newHash)}`);
        }
    } catch (e) {
        log(`Debug script error: ${e.message}`);
    }

    fs.writeFileSync('repro_result.json', JSON.stringify(result, null, 2));
    console.log('Done writing result to repro_result.json');
}

debugAuth();
