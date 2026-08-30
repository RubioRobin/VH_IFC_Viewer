import { adminApiUrl, supabase, supabaseApiKey } from './supabase';

export const API_URL = adminApiUrl;

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
        if (!window.location.hash.startsWith('#/login')) {
            window.location.href = '/admin.html#/login';
        }
        throw new Error('Je sessie is verlopen. Log opnieuw in.');
    }

    const res = await fetch(`${adminApiUrl}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            apikey: supabaseApiKey,
            Authorization: `Bearer ${session.access_token}`,
            ...options.headers,
        },
    });

    if (!res.ok) {
        if (res.status === 401) {
            await supabase.auth.signOut();
            if (!window.location.hash.startsWith('#/login')) {
                window.location.href = '/admin.html#/login';
            }
        }

        let errorMessage = `Verzoek mislukt met status ${res.status}`;
        try {
            const error = await res.json();
            errorMessage = error.error || errorMessage;
        } catch { }

        throw new Error(errorMessage);
    }

    // Handle 204 No Content
    if (res.status === 204) return null;

    return res.json();
}

export const api = {
    get: (endpoint: string) => fetchAPI(endpoint),
    post: (endpoint: string, data: any) => fetchAPI(endpoint, { method: 'POST', body: JSON.stringify(data) }),
    put: (endpoint: string, data: any) => fetchAPI(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (endpoint: string) => fetchAPI(endpoint, { method: 'DELETE' }),

    checkAuth: () => fetchAPI('/auth/me'),
    logout: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }
};
