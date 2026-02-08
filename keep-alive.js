// Keep-Alive Service for Render
// This pings the backend every 10 minutes to prevent it from sleeping

const BACKEND_URL = 'https://vh-ifc-backend.onrender.com';
const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes

async function ping() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/health`);
        const data = await response.json();
        console.log(`[${new Date().toISOString()}] ✅ Ping successful:`, data.status);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Ping failed:`, error.message);
    }
}

// Initial ping
console.log('🔄 Keep-Alive Service Started');
console.log(`📍 Target: ${BACKEND_URL}`);
console.log(`⏱️  Interval: ${PING_INTERVAL / 1000 / 60} minutes\n`);

ping();

// Set up interval
setInterval(ping, PING_INTERVAL);

// Keep process alive
process.on('SIGINT', () => {
    console.log('\n👋 Keep-Alive Service Stopped');
    process.exit(0);
});
