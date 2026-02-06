const db = require('./database');
const { v4: uuidv4 } = require('uuid');

async function testPermissions() {
    console.log('--- TESTING DB PERMISSIONS ---');
    await db.initDatabase();

    // 1. Test Fetching Projects
    console.log('\n[TEST] Fetching all projects...');
    try {
        const projects = await db.getAllProjects();
        console.log(`✅ Success. Count: ${projects.length}`);
        if (projects.length === 0) console.log('⚠️  Note: 0 projects found. Could be empty DB or RLS blocking.');
    } catch (e) {
        console.error('❌ Failed to fetch projects:', e.message);
    }

    // 2. Test Creating Project
    console.log('\n[TEST] Attempting to create a test project...');
    const testId = uuidv4();
    try {
        const newProject = await db.createProject(testId, 'Test Project', 'Created by Debug Script', 'active');
        if (newProject) {
            console.log('✅ Create Success:', newProject.id);
            // Cleanup
            console.log('Cleaning up...');
            await db.deleteProject(testId);
        } else {
            console.log('❌ Create returned null (likely silent failure/RLS)');
        }
    } catch (e) {
        console.error('❌ Create Failed:', e.message);
    }

    // 3. Test Fetching Users (Admin check)
    console.log('\n[TEST] Fetching statistics (includes user count check)...');
    try {
        const stats = await db.getStatistics();
        console.log('Statistics:', stats);
    } catch (e) {
        console.error('❌ Failed to fetch stats:', e.message);
    }
}

testPermissions();
