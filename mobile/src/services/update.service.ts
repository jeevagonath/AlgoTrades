import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

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

                // Find APK asset in release
                let apkUrl = response.data.html_url; // Fallback to release page
                if (response.data.assets && response.data.assets.length > 0) {
                    const apkAsset = response.data.assets.find((asset: any) =>
                        asset.name.endsWith('.apk') && asset.browser_download_url
                    );
                    if (apkAsset) {
                        apkUrl = apkAsset.browser_download_url; // Direct APK download URL
                    }
                }

                return {
                    version: latestVersion,
                    url: apkUrl, // Now contains direct APK URL if available
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
    },

    async getApkDownloadUrl(releaseUrl: string): Promise<string | null> {
        try {
            const response = await axios.get(releaseUrl.replace('/tag/', '/').replace('github.com', 'api.github.com/repos') + '/releases/latest', {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                },
            });

            if (response.data && response.data.assets) {
                const apkAsset = response.data.assets.find((asset: any) =>
                    asset.name.endsWith('.apk') && asset.browser_download_url
                );
                return apkAsset ? apkAsset.browser_download_url : null;
            }
            return null;
        } catch (error) {
            console.error('Error fetching APK download URL:', error);
            return null;
        }
    },

    async downloadAndInstallApk(
        downloadUrl: string,
        onProgress?: (progress: number) => void
    ): Promise<void> {
        if (Platform.OS !== 'android') {
            throw new Error('APK installation is only supported on Android');
        }

        try {
            // Use cache directory for temporary APK storage
            // @ts-ignore
            const fileUri = `${FileSystem.cacheDirectory}update.apk`;

            // Delete old APK if it exists
            try {
                const fileInfo = await FileSystem.getInfoAsync(fileUri);
                if (fileInfo.exists) {
                    await FileSystem.deleteAsync(fileUri);
                }
            } catch (err) {
                // File doesn't exist, continue
            }

            const downloadResumable = FileSystem.createDownloadResumable(
                downloadUrl,
                fileUri,
                {},
                (downloadProgress) => {
                    const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                    onProgress?.(progress * 100);
                }
            );

            const result = await downloadResumable.downloadAsync();

            if (result && result.uri) {
                // Check if sharing is available
                const isAvailable = await Sharing.isAvailableAsync();
                if (!isAvailable) {
                    throw new Error('Sharing is not available on this device');
                }

                // Use Sharing API which handles FileProvider automatically
                // This opens the system share dialog with install option
                await Sharing.shareAsync(result.uri, {
                    mimeType: 'application/vnd.android.package-archive',
                    dialogTitle: 'Install Update',
                    UTI: 'public.apk'
                });
            }
        } catch (error) {
            console.error('Error downloading/installing APK:', error);
            throw error;
        }
    }
};

