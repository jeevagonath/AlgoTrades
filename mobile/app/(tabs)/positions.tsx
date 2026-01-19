import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, FlatList, RefreshControl, SafeAreaView, Platform } from 'react-native';
import { PositionRow } from '@/src/components/PositionRow';
import { strategyApi } from '@/src/services/api';
import { socketService } from '@/src/services/socket';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Theme } from '@/src/constants/Theme';

export default function PositionsScreen() {
    const [positions, setPositions] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const fetchPositions = useCallback(async () => {
        try {
            const state = await strategyApi.getState();
            if (state && state.selectedStrikes) {
                setPositions(state.selectedStrikes);

                // Subscribe to price updates for all position tokens
                const tokens = state.selectedStrikes.map((leg: any) => leg.token);
                if (tokens.length > 0) {
                    socketService.subscribe(tokens);
                    console.log('[POSITIONS] Subscribed to tokens:', tokens);
                }
            }
        } catch (err) {
            console.error('Failed to fetch positions:', err);
        }
    }, []);

    useEffect(() => {
        fetchPositions();

        socketService.on('price_update', (data: any) => {
            setPositions(prev => prev.map(leg =>
                leg.token === data.token ? { ...leg, ltp: data.ltp } : leg
            ));
        });

        socketService.on('positions_updated', (data: any) => {
            if (Array.isArray(data)) {
                setPositions(data);

                // Subscribe to new position tokens
                const tokens = data.map((leg: any) => leg.token);
                if (tokens.length > 0) {
                    socketService.subscribe(tokens);
                    console.log('[POSITIONS] Subscribed to updated tokens:', tokens);
                }
            }
        });

        socketService.on('strategy_exit', () => {
            setPositions([]);
        });

        return () => {
            // socketService.off('price_update');
        };
    }, [fetchPositions]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchPositions();
        setRefreshing(false);
    };

    const totalPnL = React.useMemo(() => {
        return positions.reduce((acc, leg) => {
            const pnl = leg.side === 'BUY' ? (leg.ltp - leg.entryPrice) : (leg.entryPrice - leg.ltp);
            return acc + (pnl * (leg.quantity || 75));
        }, 0);
    }, [positions]);

    const isProfit = totalPnL >= 0;
    const accentColor = isProfit ? Theme.colors.success : Theme.colors.error;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Position Book</Text>
                    <Text style={styles.subtitle}>{positions.length} Active legs</Text>
                </View>
                <View style={[styles.pnlBadge, { backgroundColor: accentColor + '15', borderColor: accentColor + '30' }]}>
                    <Text style={[styles.pnlLabel, { color: Theme.colors.textDim }]}>TOTAL PNL</Text>
                    <Text style={[styles.pnlValue, { color: accentColor }]}>
                        {isProfit ? '+' : ''}₹{totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                </View>
            </View>

            {positions.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No active positions</Text>
                </View>
            ) : (
                <FlatList
                    data={positions}
                    keyExtractor={(item) => item.token}
                    renderItem={({ item, index }) => (
                        <Animated.View entering={FadeIn.delay(index * 100)}>
                            <PositionRow leg={item} />
                        </Animated.View>
                    )}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.primary} />
                    }
                    contentContainerStyle={styles.listContent}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
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
    subtitle: {
        fontSize: 12,
        color: Theme.colors.textDim,
        fontWeight: '700',
        marginTop: 2,
    },
    pnlBadge: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'flex-end',
    },
    pnlLabel: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1,
        marginBottom: 2,
    },
    pnlValue: {
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    listContent: {
        paddingTop: 8,
        paddingBottom: 40,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        fontSize: 15,
        fontWeight: '700',
        color: Theme.colors.textDim,
    },
});
