// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const config = {
  apiUrl: API_URL,
  endpoints: {
    health: `${API_URL}/api/health`,
    login: `${API_URL}/api/auth/login`,
    projects: `${API_URL}/api/projects`,
    files: `${API_URL}/api/files`,
    qr: `${API_URL}/api/qr`,
    statistics: `${API_URL}/api/statistics`,
    activity: `${API_URL}/api/activity`,
  },
};

export default config;
