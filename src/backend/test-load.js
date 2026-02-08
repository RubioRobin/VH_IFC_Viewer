// Test script to find the exact error
try {
    require('dotenv').config();
    console.log('✅ Dotenv loaded');

    console.log('Loading routes...');
    const uploadRouter = require('./routes/upload');
    console.log('✅ Upload router loaded');

    const viewerRouter = require('./routes/viewer');
    console.log('✅ Viewer router loaded');

    console.log('\n✅ All modules loaded successfully!');
} catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
}
