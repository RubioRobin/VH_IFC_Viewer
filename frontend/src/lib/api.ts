export const API_URL = import.meta.env.VITE_API_URL || 'https://vh-ifc-backend.onrender.com';

// Global flag to prevent multiple redirects during parallel requests (e.g. multi-upload)
let isRedirecting = false;

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
    const res = await fetch(`${API_URL}/api${endpoint}`, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!res.ok) {
        if (res.status === 401 && !endpoint.includes('/auth/login')) {
            // Redirect to login if unauthorized and not currently logging in
            const currentHash = window.location.hash;
            if (currentHash !== '#/login' && !currentHash.startsWith('#/login') && !isRedirecting) {
                isRedirecting = true;
                console.warn('Niet geautoriseerde toegang gedetecteerd, doorverwijzen naar inlogpagina...');
                window.location.href = '/admin.html#/login';
            }
            throw new Error("Unauthorized");
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
    logout: () => fetchAPI('/auth/logout', { method: 'POST' })
};
