const database = require('./database');

async function testUrl() {
    console.log("Initializing DB...");
    await database.initDatabase();

    // Get any file
    const files = await database.getAllFiles();
    if (files.length === 0) {
        console.log("No files found to test.");
        return;
    }

    const file = files[0];
    console.log(`Testing with file: ${file.original_name} (ID: ${file.id})`);
    console.log(`Stored Path: ${file.path}`);

    // Test Public URL
    const publicUrl = await database.getFilePublicUrl(file.path);
    console.log(`Generated Public URL: ${publicUrl}`);
}

testUrl();
