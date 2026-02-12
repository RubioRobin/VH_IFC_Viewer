const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../database');

async function run() {
    await db.initDatabase();

    // Get stats
    const stats = await db.getStatistics();

    console.log(JSON.stringify({
        total_qr_codes: stats.total_qr_codes
    }, null, 2));

    process.exit(0);
}

run().catch(console.error);
