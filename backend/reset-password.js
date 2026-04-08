/**
 * reset-password.js — Eenmalig wachtwoord-reset script
 *
 * Gebruik:
 *   node reset-password.js <gebruikersnaam> <nieuw-wachtwoord>
 *
 * Voorbeeld:
 *   node reset-password.js Robin NieuwWachtwoord123
 *
 * Vereist: .env bestand met SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const [,, username, newPassword] = process.argv;

if (!username || !newPassword) {
    console.error('Gebruik: node reset-password.js <gebruikersnaam> <nieuw-wachtwoord>');
    process.exit(1);
}

if (newPassword.length < 6) {
    console.error('Wachtwoord moet minimaal 6 tekens lang zijn.');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Service role omzeilt RLS
);

(async () => {
    // 1. Gebruiker opzoeken
    const { data: user, error: findError } = await supabase
        .from('users')
        .select('id, username, disabled')
        .eq('username', username)
        .single();

    if (findError || !user) {
        console.error(`Gebruiker '${username}' niet gevonden.`);
        console.error('Beschikbare gebruikers:');
        const { data: all } = await supabase.from('users').select('username, disabled');
        (all || []).forEach(u => console.log(`  - ${u.username}${u.disabled ? ' (uitgeschakeld)' : ''}`));
        process.exit(1);
    }

    // 2. Nieuw hash genereren
    const hash = await bcrypt.hash(newPassword, 10);

    // 3. Opslaan
    const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: hash, disabled: false })
        .eq('id', user.id);

    if (updateError) {
        console.error('Wachtwoord bijwerken mislukt:', updateError.message);
        process.exit(1);
    }

    console.log(`Wachtwoord voor '${username}' is bijgewerkt.`);
    console.log('Je kan nu inloggen met het nieuwe wachtwoord.');
})();
