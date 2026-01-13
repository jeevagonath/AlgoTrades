import React from 'react';
import { View, StyleSheet, Linking, Platform } from 'react-native';
import { Modal, Portal, Text, Button, IconButton } from 'react-native-paper';
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
    if (!versionInfo) return null;

    const handleUpdate = () => {
        Linking.openURL(versionInfo.url);
    };

    return (
        <Portal>
            <Modal
                visible={visible}
                onDismiss={onDismiss}
                contentContainerStyle={styles.container}
            >
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
                        style={styles.updateButton}
                        contentStyle={styles.buttonContent}
                        icon={() => <ExternalLink size={18} color="#fff" />}
                    >
                        Update Now
                    </Button>
                    <Button
                        mode="text"
                        onPress={onDismiss}
                        textColor={Theme.colors.textMuted}
                        style={styles.laterButton}
                    >
                        Maybe Later
                    </Button>
                </View>
            </Modal>
        </Portal>
    );
};

const styles = StyleSheet.create({
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
});
