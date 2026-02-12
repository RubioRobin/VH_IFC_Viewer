const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../database');
const { v4: uuidv4 } = require('uuid');

async function run() {
    // console.log('Init DB...');
    await db.initDatabase();

    // console.log('Getting files...');
    // Get all files
    let files = await db.getAllFiles();

    if (files.length === 0) {
        // console.log('Creating dummy project and file...');
        try {
            // Create dummy project
            const projectId = uuidv4();
            // console.log('Creating project with ID:', projectId);
            const project = await db.createProject(projectId, 'Test Project ' + Date.now(), 'Created for verification', 'actief');
            // console.log('Project created:', project);

            // Create dummy file
            // console.log('Creating file...');
            const file = await db.createFile(uuidv4(), projectId, 'test_file.ifc', 'dummy/path/test_file.ifc', 1024);
            // console.log('File created:', file);

            files = [file];
        } catch (e) {
            console.error('Error creating dummy data:', e);
            process.exit(1);
        }
    }

    // Pick first one
    const file = files[0];

    // console.log('File found:', file);

    console.log(file.id);

    process.exit(0);
}

run().catch(e => {
    console.error('Unhandled error:', e);
    process.exit(1);
});
