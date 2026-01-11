import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '@/src/constants/Theme';

interface MetricCardProps {
    label: string;
    value: number;
    icon?: LucideIcon;
    type?: 'positive' | 'negative' | 'neutral';
    prefix?: string;
    decimalPlaces?: number;
    containerStyle?: any;
}

export const MetricCard: React.FC<MetricCardProps> = ({
    label,
    value,
    icon: Icon,
    type = 'neutral',
    prefix = '₹',
    decimalPlaces = 2,
    containerStyle
}) => {
    const flashAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.timing(flashAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: false,
            }),
            Animated.timing(flashAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: false,
            }),
        ]).start();
    }, [value]);

    const getColors = () => {
        if (type === 'positive') return [Theme.colors.success, 'rgba(16, 185, 129, 0.1)'];
        if (type === 'negative') return [Theme.colors.error, 'rgba(239, 68, 68, 0.1)'];
        return [Theme.colors.textMuted, 'rgba(148, 163, 184, 0.1)'];
    };

    const [accent, accentMuted] = getColors();

    const glowOpacity = flashAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.1, 0.3]
    });

    return (
        <View style={[styles.cardContainer, containerStyle]}>
            <Animated.View style={[styles.glow, { borderColor: accent, opacity: glowOpacity }]} />
            <View style={styles.card}>
                <LinearGradient
                    colors={['rgba(30, 41, 59, 0.7)', 'rgba(15, 23, 42, 0.8)']}
                    style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.content}>
                    <View style={styles.header}>
                        <Text style={styles.label}>{label}</Text>
                        <View style={[styles.iconContainer, { backgroundColor: accentMuted }]}>
                            {Icon && <Icon size={14} color={accent} />}
                        </View>
                    </View>
                    <View style={styles.valueContainer}>
                        <Text style={[styles.value, { color: type === 'neutral' ? Theme.colors.text : accent }]}>
                            {prefix}{value.toLocaleString('en-IN', {
                                minimumFractionDigits: decimalPlaces,
                                maximumFractionDigits: decimalPlaces
                            })}
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    cardContainer: {
        margin: 6,
        minHeight: 110,
    },
    glow: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 24,
        borderWidth: 1.5,
        shadowColor: Theme.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 10,
        shadowOpacity: 0.5,
    },
    card: {
        flex: 1,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    content: {
        padding: 16,
        flex: 1,
        justifyContent: 'center',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    label: {
        fontSize: 11,
        fontWeight: '800',
        color: Theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    iconContainer: {
        width: 28,
        height: 28,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    valueContainer: {
        marginTop: 0,
    },
    value: {
        fontSize: 26,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
});
