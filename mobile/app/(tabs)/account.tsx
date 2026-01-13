import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    SafeAreaView,
    Platform
} from 'react-native';
import {
    User,
    Shield,
    CreditCard,
    Wallet,
    ChevronRight,
    Info,
    Banknote,
    Briefcase
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Theme } from '@/src/constants/Theme';
import { authApi } from '@/src/services/api';

export default function AccountScreen() {
    const [clientDetails, setClientDetails] = useState<any>(null);
    const [userDetails, setUserDetails] = useState<any>(null);
    const [margins, setMargins] = useState<any>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            const [cRes, uRes, mRes] = await Promise.all([
                authApi.getClient(),
                authApi.getUser(),
                authApi.getMargins()
            ]);

            if (cRes.status === 'success') setClientDetails(cRes.data);
            if (uRes.status === 'success') setUserDetails(uRes.data);
            if (mRes.status === 'success') setMargins(mRes.data);
        } catch (error) {
            console.error('Failed to fetch account info:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    const InfoRow = ({ label, value, icon: Icon, color }: any) => (
        <Animated.View entering={FadeInRight} style={styles.infoRow}>
            <View style={[styles.iconContainer, { backgroundColor: color + '10' }]}>
                <Icon size={18} color={color} />
            </View>
            <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowValue}>{value || 'N/A'}</Text>
            </View>
        </Animated.View>
    );

    const SectionHeader = ({ title, icon: Icon, color }: any) => (
        <View style={styles.sectionHeader}>
            <Icon size={20} color={color} />
            <Text style={styles.sectionTitle}>{title}</Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.primary} />
                }
            >
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Account Intelligence</Text>
                    <Text style={styles.headerSubtitle}>Institutional Grade Sync</Text>
                </View>

                {/* Profile Card */}
                <Animated.View entering={FadeInDown.duration(600)} style={styles.profileCardWrapper}>
                    <LinearGradient
                        colors={[Theme.colors.surface, '#1a1f2e']}
                        style={styles.profileCard}
                    >
                        <View style={styles.profileHeader}>
                            <View style={styles.avatarContainer}>
                                <LinearGradient
                                    colors={[Theme.colors.primary, Theme.colors.secondary]}
                                    style={styles.avatarGradient}
                                >
                                    <Text style={styles.avatarText}>
                                        {(clientDetails?.cliname || clientDetails?.uname || 'U').charAt(0).toUpperCase()}
                                    </Text>
                                </LinearGradient>
                                <View style={styles.onlineBadge} />
                            </View>
                            <View>
                                <Text style={styles.userName}>{(clientDetails || userDetails)?.cliname || (userDetails || clientDetails)?.uname || 'Trade User'}</Text>
                                <View style={styles.idBadge}>
                                    <Text style={styles.idBadgeText}>{(clientDetails || userDetails)?.actid || 'N/A'}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.statsGrid}>
                            <View style={styles.statItem}>
                                <Text style={styles.statLabel}>Cash</Text>
                                <Text style={styles.statValue}>
                                    ₹{parseFloat(margins?.cash || '0').toLocaleString('en-IN')}
                                </Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statLabel}>Margin</Text>
                                <Text style={styles.statValue}>
                                    ₹{parseFloat(margins?.marginused || '0').toLocaleString('en-IN')}
                                </Text>
                            </View>
                        </View>
                    </LinearGradient>
                </Animated.View>

                {/* Basic Info Section */}
                <View style={styles.section}>
                    <SectionHeader title="Identity & Broker" icon={Shield} color="#3b82f6" />
                    <View style={styles.card}>
                        <InfoRow label="Email Address" value={clientDetails?.email} icon={Info} color="#3b82f6" />
                        <InfoRow label="PAN Number" value={userDetails?.pan} icon={CreditCard} color="#3b82f6" />
                        <InfoRow label="Broker" value="FINVASIA" icon={Briefcase} color="#3b82f6" />
                    </View>
                </View>

                {/* Banking Section */}
                <View style={styles.section}>
                    <SectionHeader title="Banking Interface" icon={Wallet} color="#10b981" />
                    <View style={styles.card}>
                        <InfoRow label="Bank Name" value={clientDetails?.bnk} icon={CreditCard} color="#10b981" />
                        <InfoRow
                            label="Account Number"
                            value={clientDetails?.accno ? `****${clientDetails.accno.slice(-4)}` : 'N/A'}
                            icon={Info}
                            color="#10b981"
                        />
                        <InfoRow label="IFSC Code" value={clientDetails?.ifsc} icon={Info} color="#10b981" />
                    </View>
                </View>

                {/* Liquidity Section */}
                <View style={styles.section}>
                    <SectionHeader title="Financial Liquidity" icon={Banknote} color="#f59e0b" />
                    <View style={styles.card}>
                        <InfoRow
                            label="Pay-in Today"
                            value={`₹${parseFloat(margins?.payin || '0').toLocaleString('en-IN')}`}
                            icon={Wallet}
                            color="#f59e0b"
                        />
                        <InfoRow
                            label="Collateral"
                            value={`₹${parseFloat(margins?.collateral || '0').toLocaleString('en-IN')}`}
                            icon={Shield}
                            color="#f59e0b"
                        />
                    </View>
                </View>

                <View style={styles.footerSpacing} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    scrollContent: {
        padding: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 20,
    },
    header: {
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: -1,
    },
    headerSubtitle: {
        fontSize: 12,
        color: Theme.colors.primary,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginTop: 4,
    },
    profileCardWrapper: {
        marginBottom: 32,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    profileCard: {
        padding: 24,
    },
    profileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 16,
    },
    avatarGradient: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 24,
        fontWeight: '900',
        color: '#fff',
    },
    onlineBadge: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#10b981',
        borderWidth: 2,
        borderColor: Theme.colors.surface,
    },
    userName: {
        fontSize: 20,
        fontWeight: '900',
        color: '#fff',
    },
    idBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        alignSelf: 'flex-start',
        marginTop: 4,
    },
    idBadgeText: {
        fontSize: 10,
        color: Theme.colors.textDim,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    statsGrid: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 16,
        padding: 16,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 10,
        color: Theme.colors.textDim,
        fontWeight: '800',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    statValue: {
        fontSize: 15,
        fontWeight: '900',
        color: Theme.colors.primary,
    },
    statDivider: {
        width: 1,
        height: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    section: {
        marginBottom: 32,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        paddingLeft: 4,
    },
    sectionTitle: {
        fontSize: 12,
        color: Theme.colors.textDim,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginLeft: 10,
    },
    card: {
        backgroundColor: Theme.colors.surface,
        borderRadius: 24,
        padding: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.03)',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    rowContent: {
        flex: 1,
    },
    rowLabel: {
        fontSize: 10,
        color: Theme.colors.textDim,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    rowValue: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '800',
    },
    footerSpacing: {
        height: 100,
    },
});
