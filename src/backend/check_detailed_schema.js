require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDetailedSchema() {
    try {
        const { data, error } = await supabase.rpc('get_table_info', { t_name: 'files' });
        if (error) {
            // Fallback: use information_schema via standard query if possible
            // But Supabase client doesn't allow direct selection from information_schema
            // We'll try to insert a mostly empty object again and carefully parse the error.
            console.log('Trying insert to trigger error message...');
            const { error: insErr } = await supabase.from('files').insert({}).select();
            console.log('Constraint Violation Message:', insErr?.message);
            console.log('Full Error Object:', JSON.stringify(insErr, null, 2));
        } else {
            console.log('Table Schema:', data);
        }
    } catch (e) {
        console.error(e);
    }
}

checkDetailedSchema();
