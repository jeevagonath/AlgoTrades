import React from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { Theme } from '@/src/constants/Theme';
import { LinearGradient } from 'expo-linear-gradient';

interface PositionRowProps {
    leg: {
        symbol: string;
        token: string;
        side: 'BUY' | 'SELL';
        strike: string;
        entryPrice: number;
        ltp: number;
    };
}

export const PositionRow: React.FC<PositionRowProps> = ({ leg }) => {
    const isProfit = leg.side === 'BUY' ? leg.ltp > leg.entryPrice : leg.ltp < leg.entryPrice;
    const accentColor = isProfit ? Theme.colors.success : Theme.colors.error;
    const sideColor = leg.side === 'BUY' ? Theme.colors.primary : Theme.colors.warning;

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['rgba(30, 41, 59, 0.4)', 'rgba(15, 23, 42, 0.6)']}
                style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.left}>
                <Text style={styles.symbol}>{leg.symbol}</Text>
                <Text style={styles.token}>{leg.token}</Text>
            </View>

            <View style={styles.center}>
                <View style={[styles.sideBadge, { backgroundColor: sideColor + '15', borderColor: sideColor + '30' }]}>
                    <Text style={[styles.sideText, { color: sideColor }]}>
                        {leg.side}
                    </Text>
                </View>
                <Text style={styles.strike}>{leg.strike}</Text>
            </View>

            <View style={styles.right}>
                <Text style={styles.entryPrice}>ENT: ₹{leg.entryPrice.toFixed(2)}</Text>
                <View style={styles.ltpContainer}>
                    <Text style={[styles.ltp, { color: accentColor }]}>₹{leg.ltp.toFixed(2)}</Text>
                    {isProfit ? <TrendingUp size={14} color={accentColor} /> : <TrendingDown size={14} color={accentColor} />}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 18,
        paddingHorizontal: 20,
        backgroundColor: Theme.colors.surface,
        marginHorizontal: 16,
        marginVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
    },
    left: {
        flex: 2.2,
    },
    symbol: {
        fontSize: 15,
        fontWeight: '900',
        color: Theme.colors.text,
        letterSpacing: -0.3,
    },
    token: {
        fontSize: 10,
        color: Theme.colors.textDim,
        fontWeight: '700',
        marginTop: 2,
    },
    center: {
        flex: 1.2,
        alignItems: 'center',
    },
    sideBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        marginBottom: 6,
    },
    sideText: {
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    strike: {
        fontSize: 12,
        color: Theme.colors.textMuted,
        fontWeight: '800',
    },
    right: {
        flex: 2,
        alignItems: 'flex-end',
    },
    entryPrice: {
        fontSize: 10,
        color: Theme.colors.textDim,
        fontWeight: '700',
        marginBottom: 2,
    },
    ltpContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    ltp: {
        fontSize: 17,
        fontWeight: '900',
        letterSpacing: -0.5,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
});
