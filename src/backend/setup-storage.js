require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Supabase URL or Service Role Key missing!');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function setupStorage() {
    console.log('--- Setting up Supabase Storage ---');

    const buckets = [
        { name: 'ifc-private', public: false },
        { name: 'qr-public', public: true }
    ];

    for (const bucket of buckets) {
        console.log(`Checking bucket: ${bucket.name}...`);
        const { data, error } = await supabase.storage.getBucket(bucket.name);

        if (error && error.message.includes('not found')) {
            console.log(`Bucket "${bucket.name}" not found. Creating...`);
            const { error: createError } = await supabase.storage.createBucket(bucket.name, {
                public: bucket.public,
                allowedMimeTypes: bucket.name === 'qr-public' ? ['image/png'] : undefined
            });

            if (createError) {
                console.error(`❌ Error creating bucket "${bucket.name}":`, createError.message);
            } else {
                console.log(`✅ Bucket "${bucket.name}" created successfully.`);
            }
        } else if (error) {
            console.error(`❌ Error checking bucket "${bucket.name}":`, error.message);
        } else {
            console.log(`✅ Bucket "${bucket.name}" already exists.`);
        }
    }
}

setupStorage();
