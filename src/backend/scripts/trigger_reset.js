const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../database');

async function run() {
    await db.initDatabase();

    console.log('Resetting scan activity...');
    await db.resetScanActivity();

    const stats = await db.getStatistics();
    console.log('New total_qr_codes:', stats.total_qr_codes);

    process.exit(0);
}

run().catch(console.error);
