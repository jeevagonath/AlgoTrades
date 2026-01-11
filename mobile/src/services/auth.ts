import { authApi } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const checkAuth = async () => {
    try {
        const res = await authApi.getSession();
        return res.status === 'success' && res.data.authenticated;
    } catch (e) {
        return false;
    }
};

export const logout = async () => {
    try {
        await authApi.logout();
        await AsyncStorage.removeItem('user_token'); // If we had one
    } catch (e) {
        console.error('Logout failed', e);
    }
};
