export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
    const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    const res = await fetch(`${baseUrl}/api${endpoint}`, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!res.ok) {
        if (res.status === 401) {
            window.location.hash = '/login';
            throw new Error("Unauthorized");
        }
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `Request failed with status ${res.status}`);
    }

    return res.json();
}
