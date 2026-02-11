// api.ts - Robust API wrapper
const API_BASE = '/api';

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const defaultHeaders = {
        'Content-Type': 'application/json',
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    try {
        const response = await fetch(url, config);

        // Handle 401 Unauthorized globally if needed (e.g. redirect to login)
        if (response.status === 401 && !endpoint.includes('/auth/login')) {
            window.location.href = '/login.html';
            throw new ApiError('Unauthorized', 401);
        }

        if (!response.ok) {
            let errorMessage = 'Unknown error';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || response.statusText;
            } catch {
                errorMessage = response.statusText;
            }
            throw new ApiError(errorMessage, response.status);
        }

        // Handle 204 No Content
        if (response.status === 204) return {} as T;

        return await response.json();
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new Error(error instanceof Error ? error.message : 'Network error');
    }
}

export const api = {
    get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
    post: <T>(endpoint: string, data: any) => request<T>(endpoint, { method: 'POST', body: JSON.stringify(data) }),
    put: <T>(endpoint: string, data: any) => request<T>(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
    delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),

    // Auth helpers
    checkAuth: () => request<{ id: string, username: string, role: string }>('/auth/me'), // Now using correct route
    logout: () => request('/auth/logout', { method: 'POST' })
};
