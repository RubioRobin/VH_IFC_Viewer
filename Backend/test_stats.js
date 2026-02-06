// require('dotenv').config(); // Not needed, hardcoded in database.js
const database = require('./database');

async function testStats() {
    console.log("Initializing DB...");
    await database.initDatabase();

    console.log("Testing getStatistics...");
    try {
        const stats = await database.getStatistics();
        console.log("Stats result:", stats);
    } catch (e) {
        console.error("Stats failed:", e);
    }

    console.log("Testing getRecentActivity...");
    try {
        const activity = await database.getRecentActivity(5);
        console.log("Activity result:", activity);
    } catch (e) {
        console.error("Activity failed:", e);
    }
}

testStats();
