const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

// Load environment variables if not present (simplified for this script, assumes hardcoded fallback specific to this environment or env vars set)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lqkdcllyikctudrgdanp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxa2RjbGx5aWtjdHVkcmdkYW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzUyMTUsImV4cCI6MjA4NTk1MTIxNX0.9FWKG_QLfcEc5qXw5irnTeB1ppaIOEk_GMkbyAOHELU';

async function fixAdmin() {
    console.log('--- FIX ADMIN PASSWORD STARTED ---');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
        // 1. Fetch current admin
        console.log('Fetching admin user...');
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', 'admin')
            .single();

        if (error || !user) {
            console.error('❌ User not found or error:', error);
            // Optional: Create if missing?
            return;
        }

        console.log('Current Hash:', user.password_hash);
        console.log('Current Length:', user.password_hash ? user.password_hash.length : 0);

        // 2. Refresh Hash
        const newHash = bcrypt.hashSync('admin123', 10);
        console.log('New Hash Generated:', newHash);
        console.log('New Hash Length:', newHash.length);

        // 3. Update DB
        console.log('Updating database...');
        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({ password_hash: newHash })
            .eq('id', user.id)
            .select()
            .single();

        if (updateError) {
            console.error('❌ Update failed:', updateError);
        } else {
            console.log('✅ Update successful!');
            console.log('Updated Hash:', updatedUser.password_hash);
            console.log('Updated Length:', updatedUser.password_hash.length);

            if (updatedUser.password_hash.length < 60) {
                console.log('⚠️ WARNING: HASH TRUNCATED! DATABASE COLUMN IS TOO SHORT.');
            } else {
                console.log('✅ Hash verified as full length.');
            }
        }

    } catch (e) {
        console.error('Script Error:', e);
    }
}

fixAdmin();
