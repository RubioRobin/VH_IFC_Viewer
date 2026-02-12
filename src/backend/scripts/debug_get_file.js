const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../database');

async function run() {
    await db.initDatabase();

    const id = '7e63b83e-470d-4bea-aa4e-2cfeb97ff754';
    console.log('Testing getFileById for:', id);

    const file = await db.getFileById(id);
    console.log('GET_BY_ID:', file ? 'FOUND' : 'NOT_FOUND');

    // Also try getAllFiles and filter
    const all = await db.getAllFiles();
    const found = all.find(f => f.id === id);
    console.log('GET_ALL_FILES:', found ? 'FOUND' : 'NOT_FOUND');

    if (found) console.log('FOUND_ID:', found.id);

    process.exit(0);
}

run().catch(console.error);
