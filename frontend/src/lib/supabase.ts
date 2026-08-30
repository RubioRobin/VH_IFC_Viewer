import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = String(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY
    || ''
);

if (!supabaseUrl || !publishableKey) {
    throw new Error('VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY ontbreken.');
}

export const adminApiUrl = `${supabaseUrl}/functions/v1/admin-api`;
export const supabaseApiKey = publishableKey;

export const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

export async function prepareLegacyAdminLogin(username: string): Promise<string> {
    const response = await fetch(`${adminApiUrl}/auth/prepare-legacy-login`, {
        method: 'POST',
        headers: {
            apikey: publishableKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
    });

    if (!response.ok) {
        throw new Error('Gebruikersnaam of wachtwoord is onjuist.');
    }

    const data = await response.json();
    if (!data.loginEmail) {
        throw new Error('Het adminaccount kon niet worden voorbereid.');
    }

    return String(data.loginEmail);
}
