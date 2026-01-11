import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, Linking } from 'react-native';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react-native';
import { Theme } from '@/src/constants/Theme';
import { LinearGradient } from 'expo-linear-gradient';

interface NiftyTickerProps {
    data: {
        price: number;
        change: number;
        changePercent: number;
    } | null;
}

export const NiftyTicker: React.FC<NiftyTickerProps> = ({ data }) => {
    if (!data) return null;

    const isPositive = data.change >= 0;
    const accentColor = isPositive ? Theme.colors.success : Theme.colors.error;

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['rgba(30, 41, 59, 0.4)', 'rgba(15, 23, 42, 0.6)']}
                style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.left}>
                <Text style={styles.label}>NIFTY 50</Text>
                <Text style={styles.price}>
                    {data.price.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}
                </Text>
            </View>
            <View style={styles.right}>
                <View style={styles.statsContainer}>
                    <Text style={[styles.change, { color: accentColor }]}>
                        {isPositive ? '+' : ''}{data.change.toFixed(2)}
                    </Text>
                    <View style={[styles.percentageBadge, { backgroundColor: accentColor + '15' }]}>
                        <View style={{ marginRight: 4 }}>
                            {isPositive ? (
                                <TrendingUp size={12} color={accentColor} />
                            ) : (
                                <TrendingDown size={12} color={accentColor} />
                            )}
                        </View>
                        <Text style={[styles.percentageText, { color: accentColor }]}>
                            {Math.abs(data.changePercent).toFixed(2)}%
                        </Text>
                    </View>
                </View>
                <TouchableOpacity
                    onPress={() => Linking.openURL('https://www.tradingview.com/chart/?symbol=NSE%3ANIFTY')}
                    style={styles.chartBtn}
                >
                    <BarChart3 size={18} color={Theme.colors.textMuted} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: Theme.colors.surface,
        borderRadius: 20,
        padding: 16,
        paddingHorizontal: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
    },
    left: {
        flex: 1,
    },
    label: {
        fontSize: 10,
        fontWeight: '800',
        color: Theme.colors.textDim,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    price: {
        fontSize: 22,
        fontWeight: '900',
        color: Theme.colors.text,
        letterSpacing: -0.5,
        marginTop: 2,
    },
    right: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    statsContainer: {
        alignItems: 'flex-end',
    },
    change: {
        fontSize: 13,
        fontWeight: '800',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    percentageBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        marginTop: 4,
    },
    percentageText: {
        fontSize: 11,
        fontWeight: '900',
    },
    chartBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
});
