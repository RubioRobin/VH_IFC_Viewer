const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('✅ Supabase client initialized');
    } catch (e) {
        console.error('❌ Supabase init failed:', e);
    }
} else if (process.env.NODE_ENV === 'production') {
    console.error('❌ Supabase URL or Key missing!');
}

// --- INIT SERVICES ---
const activityService = require('./services/activity.service')(supabase);
const usersService = require('./services/users.service')(supabase);
const projectsService = require('./services/projects.service')(supabase, activityService.logActivity);
const filesService = require('./services/files.service')(supabase, activityService.logActivity);
const qrService = require('./services/qr.service')(supabase, activityService.logActivity);

// Database Initialization
async function initDatabase() {
    if (!supabase) return;
    console.log('--- Checking Supabase Admin ---');
    try {
        const user = await usersService.getUserByUsername('admin');
        if (!user) {
            console.log('Admin-gebruiker niet gevonden. Maak deze handmatig aan indien nodig.');
        } else {
            console.log('✅ Admin user matches found');
        }
    } catch (e) {
        console.error('Database init error:', e.message || e);
    }
    console.log('✅ Admin user check complete');
}

module.exports = {
    supabase,
    initDatabase,

    // Auth & Users
    ...usersService,

    // Projects
    ...projectsService,
    getProjects: projectsService.getAllProjects, // Alias

    // Files
    ...filesService,

    // QR & Public Links
    ...qrService,

    // Activity & Stats
    ...activityService
};
