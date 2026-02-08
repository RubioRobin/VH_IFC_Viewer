// One-time script to fix admin user in Supabase
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ SUPABASE_URL or SUPABASE_KEY not found in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fixAdmin() {
    console.log('🔍 Checking admin user...');

    try {
        // Check if admin exists
        const { data: existing, error: checkError } = await supabase
            .from('users')
            .select('*')
            .eq('username', 'admin')
            .single();

        if (existing) {
            console.log('✅ Admin user found:', existing.username);
            console.log('   Password hash length:', existing.password_hash?.length || 0);

            // Check if hash is valid
            if (!existing.password_hash || existing.password_hash.length < 50) {
                console.log('⚠️  Hash appears invalid, updating...');
                const newHash = bcrypt.hashSync('admin123', 10);
                const { error: updateError } = await supabase
                    .from('users')
                    .update({ password_hash: newHash })
                    .eq('id', existing.id);

                if (updateError) throw updateError;
                console.log('✅ Admin password hash updated!');
            } else {
                console.log('✅ Admin user is valid');
            }
        } else {
            console.log('⚠️  Admin user not found, creating...');
            const newHash = bcrypt.hashSync('admin123', 10);
            const { data, error: insertError } = await supabase
                .from('users')
                .insert([{
                    id: 'admin-1',
                    username: 'admin',
                    password_hash: newHash,
                    role: 'admin'
                }])
                .select()
                .single();

            if (insertError) throw insertError;
            console.log('✅ Admin user created:', data.username);
        }

        // Test login
        console.log('\n🧪 Testing login...');
        const { data: testUser } = await supabase
            .from('users')
            .select('*')
            .eq('username', 'admin')
            .single();

        if (testUser && bcrypt.compareSync('admin123', testUser.password_hash)) {
            console.log('✅ Login test PASSED - admin/admin123 works!');
        } else {
            console.log('❌ Login test FAILED');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

fixAdmin().then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
});
