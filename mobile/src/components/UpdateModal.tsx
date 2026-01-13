import React, { useState } from 'react';
import { View, StyleSheet, Linking, Platform, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Button, IconButton } from 'react-native-paper';
import { Download, ExternalLink, X } from 'lucide-react-native';
import { Theme } from '@/src/constants/Theme';
import { VersionInfo } from '@/src/services/update.service';

interface UpdateModalProps {
    visible: boolean;
    versionInfo: VersionInfo | null;
    currentVersion: string;
    onDismiss: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
    visible,
    versionInfo,
    currentVersion,
    onDismiss,
}) => {
    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    if (!versionInfo) return null;

    const handleUpdate = async () => {
        if (Platform.OS === 'android') {
            try {
                setDownloading(true);
                const { updateService } = await import('@/src/services/update.service');
                const apkUrl = await updateService.getApkDownloadUrl(versionInfo.url);

                if (apkUrl) {
                    await updateService.downloadAndInstallApk(apkUrl, (progress) => {
                        setDownloadProgress(Math.round(progress));
                    });
                } else {
                    // Fallback to browser if APK not found
                    Linking.openURL(versionInfo.url);
                }
            } catch (error) {
                console.error('Update error:', error);
                // Fallback to browser on error
                Linking.openURL(versionInfo.url);
            } finally {
                setDownloading(false);
                setDownloadProgress(0);
            }
        } else {
            Linking.openURL(versionInfo.url);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onDismiss}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <View style={styles.iconContainer}>
                            <Download size={24} color={Theme.colors.primary} />
                        </View>
                        <IconButton
                            icon={() => <X size={20} color={Theme.colors.textMuted} />}
                            onPress={onDismiss}
                        />
                    </View>

                    <View style={styles.content}>
                        <Text style={styles.title}>Update Available!</Text>
                        <Text style={styles.versionRow}>
                            Current: <Text style={styles.version}>{currentVersion}</Text>  →  Latest: <Text style={styles.latestVersion}>{versionInfo.version}</Text>
                        </Text>

                        <View style={styles.notesContainer}>
                            <Text style={styles.notesLabel}>What's New:</Text>
                            <Text style={styles.notes} numberOfLines={5}>
                                {versionInfo.notes || 'Performance improvements and bug fixes.'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.footer}>
                        <Button
                            mode="contained"
                            onPress={handleUpdate}
                            disabled={downloading}
                            style={styles.updateButton}
                            contentStyle={styles.buttonContent}
                            icon={() => downloading ? null : <ExternalLink size={18} color="#fff" />}
                        >
                            {downloading ? `Downloading ${downloadProgress}%` : 'Download Update'}
                        </Button>
                        {downloading && (
                            <View style={styles.progressContainer}>
                                <View style={[styles.progressBar, { width: `${downloadProgress}%` }]} />
                            </View>
                        )}
                        <Button
                            mode="text"
                            onPress={onDismiss}
                            disabled={downloading}
                            textColor={Theme.colors.textMuted}
                            style={styles.laterButton}
                        >
                            Maybe Later
                        </Button>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    container: {
        backgroundColor: Theme.colors.surface,
        margin: 20,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: 'rgba(56, 189, 248, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        color: '#fff',
        marginBottom: 8,
    },
    versionRow: {
        fontSize: 14,
        color: Theme.colors.textMuted,
        marginBottom: 20,
    },
    version: {
        fontWeight: '700',
        color: Theme.colors.textMuted,
    },
    latestVersion: {
        fontWeight: '900',
        color: Theme.colors.primary,
    },
    notesContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        padding: 16,
    },
    notesLabel: {
        fontSize: 12,
        fontWeight: '800',
        color: Theme.colors.textMuted,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    notes: {
        fontSize: 13,
        color: '#cbd5e1',
        lineHeight: 18,
    },
    footer: {
        gap: 8,
    },
    updateButton: {
        borderRadius: 12,
        backgroundColor: Theme.colors.primary,
    },
    buttonContent: {
        height: 48,
    },
    laterButton: {
        borderRadius: 12,
    },
    progressContainer: {
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 2,
        overflow: 'hidden',
        marginTop: 8,
    },
    progressBar: {
        height: '100%',
        backgroundColor: Theme.colors.primary,
        borderRadius: 2,
    },
});
