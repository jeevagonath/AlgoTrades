import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, FlatList, RefreshControl, SafeAreaView, Platform } from 'react-native';
import { strategyApi } from '@/src/services/api';
import { socketService } from '@/src/services/socket';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Theme } from '@/src/constants/Theme';

export default function LogsScreen() {
    const [logs, setLogs] = useState<{ time: string, msg: string }[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const fetchLogs = useCallback(async () => {
        try {
            const data = await strategyApi.getLogs();
            if (data) {
                setLogs(data.map((l: any) => ({ time: l.time, msg: l.msg })));
            }
        } catch (err) {
            console.error('Failed to fetch logs:', err);
        }
    }, []);

    useEffect(() => {
        fetchLogs();

        socketService.on('system_log', (data: any) => {
            setLogs(prev => [{ time: data.time, msg: data.msg }, ...prev].slice(0, 100));
        });

        return () => {
        };
    }, [fetchLogs]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchLogs();
        setRefreshing(false);
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>System Logs</Text>
            </View>

            <FlatList
                data={logs}
                keyExtractor={(item, index) => `${item.time}-${index}`}
                renderItem={({ item, index }) => (
                    <Animated.View entering={FadeIn.delay(Math.min(index * 50, 500))} style={styles.logItem}>
                        <Text style={styles.logTime}>[{item.time}]</Text>
                        <Text style={styles.logMsg}>{item.msg}</Text>
                    </Animated.View>
                )}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.primary} />
                }
                contentContainerStyle={styles.listContent}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    header: {
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 40 : 16,
        paddingBottom: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    title: {
        fontSize: 26,
        fontWeight: '900',
        color: Theme.colors.text,
        letterSpacing: -1,
    },
    listContent: {
        paddingTop: 8,
        paddingBottom: 40,
    },
    logItem: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: 'transparent',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.03)',
    },
    logTime: {
        fontSize: 11,
        fontWeight: '800',
        color: Theme.colors.textDim,
        ...Platform.select({
            ios: { fontFamily: 'Menlo' },
            android: { fontFamily: 'monospace' },
            default: { fontFamily: 'monospace' }
        }),
        width: 75,
    },
    logMsg: {
        flex: 1,
        fontSize: 13,
        color: Theme.colors.textMuted,
        fontWeight: '600',
        lineHeight: 18,
    },
});
