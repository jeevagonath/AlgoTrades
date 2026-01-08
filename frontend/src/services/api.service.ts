import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://algotradesservice.onrender.com/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const authApi = {
    login: async (credentials: any) => {
        const response = await apiClient.post('/auth/login', credentials);
        return response.data;
    },
    getSession: async () => {
        const response = await apiClient.get('/auth/session');
        return response.data;
    },
    logout: async () => {
        const response = await apiClient.post('/auth/logout');
        return response.data;
    },
};

export const strategyApi = {
    getExpiries: async () => {
        const response = await apiClient.get('/strategy/expiries');
        return response.data;
    },
    testSelection: async (expiry?: string) => {
        const response = await apiClient.post('/strategy/test-selection', { expiry });
        return response.data;
    },
    placeOrder: async () => {
        const response = await apiClient.post('/strategy/place-order');
        return response.data;
    },
    getState: async () => {
        const response = await apiClient.get('/strategy/state');
        return response.data.data;
    },
    getLogs: async () => {
        const response = await apiClient.get('/strategy/logs');
        return response.data.data;
    },
    updateSettings: async (settings: any) => {
        const response = await apiClient.post('/strategy/settings', settings);
        return response.data;
    },
    saveManualExpiries: async (expiries: string[]) => {
        const response = await apiClient.post('/strategy/manual-expiries', { expiries });
        return response.data;
    },
    getManualExpiries: async () => {
        const response = await apiClient.get('/strategy/manual-expiries');
        return response.data;
    },
    getNiftySpot: async () => {
        const response = await apiClient.get('/strategy/nifty-spot');
        return response.data;
    },
    getOrders: async () => {
        const response = await apiClient.get('/strategy/orders');
        return response.data;
    },
    manualExit: async () => {
        const response = await apiClient.post('/strategy/exit');
        return response.data;
    },
    pause: async () => {
        const response = await apiClient.post('/strategy/pause');
        return response.data;
    },
    resume: async () => {
        const response = await apiClient.post('/strategy/resume');
        return response.data;
    },
    testPlaceOrder: async () => {
        const response = await apiClient.post('/strategy/test/place-order');
        return response.data;
    },
    testExitOrder: async () => {
        const response = await apiClient.post('/strategy/test/exit-order');
        return response.data;
    },
    getAlerts: async () => {
        const response = await apiClient.get('/strategy/alerts');
        return response.data;
    },
};

export default apiClient;
