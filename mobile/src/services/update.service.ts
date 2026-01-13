import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const GITHUB_REPO = 'jeevagonath/AlgoTrades';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface VersionInfo {
    version: string;
    url: string;
    notes: string;
}

export const updateService = {
    getCurrentVersion(): string {
        return Constants.expoConfig?.version || '1.0.0';
    },

    async getLatestVersion(): Promise<VersionInfo | null> {
        try {
            const response = await axios.get(GITHUB_API_URL, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                },
            });

            if (response.data && response.data.tag_name) {
                // Tag name is usually 'v1.0.1' or '1.0.1'
                const latestVersion = response.data.tag_name.replace('v', '');
                return {
                    version: latestVersion,
                    url: response.data.html_url,
                    notes: response.data.body || '',
                };
            }
            return null;
        } catch (error) {
            console.error('Error fetching latest version:', error);
            return null;
        }
    },

    isNewerVersion(latest: string, current: string): boolean {
        const latestParts = latest.split('.').map(Number);
        const currentParts = current.split('.').map(Number);

        for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
            const latestPart = latestParts[i] || 0;
            const currentPart = currentParts[i] || 0;
            if (latestPart > currentPart) return true;
            if (latestPart < currentPart) return false;
        }
        return false;
    }
};
