require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Supabase URL or Key missing in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkStorage() {
    console.log('--- Supabase Storage Check ---');
    try {
        const { data: buckets, error } = await supabase.storage.listBuckets();
        if (error) {
            console.error('❌ Error listing buckets:', error.message);
            return;
        }

        console.log('Available buckets:', buckets.map(b => b.name).join(', '));

        const required = ['ifc-private', 'qr-public'];
        for (const req of required) {
            const exists = buckets.find(b => b.name === req);
            if (exists) {
                console.log(`✅ Bucket "${req}" exists (Public: ${exists.public})`);
            } else {
                console.log(`❌ Bucket "${req}" is MISSING!`);
            }
        }
    } catch (e) {
        console.error('❌ Unexpected error:', e.message);
    }
}

checkStorage();
