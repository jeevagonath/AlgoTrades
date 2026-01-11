import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Lock, ShieldCheck, Key, Smartphone, ArrowRight } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { authApi } from '@/src/services/api';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useAuth } from '@/src/context/AuthContext';

export default function LoginScreen() {
    const { setIsAuthenticated } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        userid: '',
        password: '',
        twoFA: '',
        api_secret: '',
        vendor_code: '',
        imei: ''
    });

    useEffect(() => {
        // Load persistent fields
        const loadSavedFields = async () => {
            try {
                const userid = await AsyncStorage.getItem('shoonya_userid');
                const api_secret = await AsyncStorage.getItem('shoonya_api_secret');
                const vendor_code = await AsyncStorage.getItem('shoonya_vendor_code');
                const imei = await AsyncStorage.getItem('shoonya_imei');

                setFormData(prev => ({
                    ...prev,
                    userid: userid || '',
                    api_secret: api_secret || '',
                    vendor_code: vendor_code || '',
                    imei: imei || ''
                }));
            } catch (e) {
                console.error('Failed to load saved fields', e);
            }
        };
        loadSavedFields();
    }, []);

    const handleChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        setLoading(true);
        setError(null);

        try {
            // Save persistent fields
            await AsyncStorage.setItem('shoonya_userid', formData.userid);
            await AsyncStorage.setItem('shoonya_vendor_code', formData.vendor_code);
            await AsyncStorage.setItem('shoonya_api_secret', formData.api_secret);
            await AsyncStorage.setItem('shoonya_imei', formData.imei);

            const res = await authApi.login(formData);
            if (res.status === 'success') {
                setIsAuthenticated(true);
                router.replace('/(tabs)');
            } else {
                setError(res.message || 'Login failed');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Connection error to backend');
        } finally {
            setLoading(false);
        }
    };

    return (
        <LinearGradient
            colors={['#ffffff', '#f1f5f9']}
            style={styles.container}
        >
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardView}
                >
                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        <Animated.View entering={FadeInDown.duration(1000).springify()} style={styles.header}>
                            <View style={styles.logoContainer}>
                                <Image
                                    source={require('@/assets/images/icon.png')}
                                    style={styles.logo}
                                    resizeMode="contain"
                                />
                            </View>
                            <Text style={styles.title}>AlgoTrades</Text>
                            <Text style={styles.subtitle}>TRADING INTELLIGENCE</Text>
                        </Animated.View>

                        <Animated.View
                            entering={FadeInUp.delay(200).duration(1000).springify()}
                            style={styles.formContainer}
                        >
                            {error && (
                                <View style={styles.errorContainer}>
                                    <Text style={styles.errorText}>{error}</Text>
                                </View>
                            )}

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>IDENTITY</Text>
                                <View style={styles.inputWrapper}>
                                    <User size={20} color="#94a3b8" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Broker User ID"
                                        placeholderTextColor="#cbd5e1"
                                        value={formData.userid}
                                        onChangeText={(v) => handleChange('userid', v)}
                                        autoCapitalize="none"
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>AUTHENTICATION</Text>
                                <View style={styles.inputWrapper}>
                                    <Lock size={20} color="#94a3b8" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter Password"
                                        placeholderTextColor="#cbd5e1"
                                        value={formData.password}
                                        onChangeText={(v) => handleChange('password', v)}
                                        secureTextEntry
                                    />
                                </View>
                            </View>

                            <View style={styles.row}>
                                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                                    <Text style={styles.label}>2FA CODE</Text>
                                    <View style={styles.inputWrapper}>
                                        <ShieldCheck size={20} color="#94a3b8" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="123456"
                                            placeholderTextColor="#cbd5e1"
                                            value={formData.twoFA}
                                            onChangeText={(v) => handleChange('twoFA', v)}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                </View>
                                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                                    <Text style={styles.label}>VENDOR</Text>
                                    <View style={styles.inputWrapper}>
                                        <Key size={20} color="#94a3b8" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Code"
                                            placeholderTextColor="#cbd5e1"
                                            value={formData.vendor_code}
                                            onChangeText={(v) => handleChange('vendor_code', v)}
                                        />
                                    </View>
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>API SECRET</Text>
                                <View style={styles.inputWrapper}>
                                    <TextInput
                                        style={[styles.input, { paddingLeft: 16 }]}
                                        placeholder="Enter Broker API Secret"
                                        placeholderTextColor="#cbd5e1"
                                        value={formData.api_secret}
                                        onChangeText={(v) => handleChange('api_secret', v)}
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>MACHINE ID / IMEI</Text>
                                <View style={styles.inputWrapper}>
                                    <Smartphone size={20} color="#94a3b8" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="e.g. ABC-123-XYZ"
                                        placeholderTextColor="#cbd5e1"
                                        value={formData.imei}
                                        onChangeText={(v) => handleChange('imei', v)}
                                    />
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[styles.button, loading && styles.buttonDisabled]}
                                onPress={handleSubmit}
                                disabled={loading}
                            >
                                <LinearGradient
                                    colors={['#0f172a', '#1e293b']}
                                    style={styles.buttonGradient}
                                >
                                    {loading ? (
                                        <Text style={styles.buttonText}>Unlocking...</Text>
                                    ) : (
                                        <>
                                            <Text style={styles.buttonText}>Unlock Trading Engine</Text>
                                            <ArrowRight size={20} color="#ffffff" />
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </Animated.View>

                        <View style={styles.footer}>
                            <View style={styles.footerDivider} />
                            <Text style={styles.footerText}>MILITARY GRADE ENCRYPTION • V1.0.6</Text>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    header: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 32,
    },
    logoContainer: {
        padding: 16,
        backgroundColor: '#ffffff',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
        marginBottom: 16,
    },
    logo: {
        width: 60,
        height: 60,
    },
    title: {
        fontSize: 32,
        fontWeight: '900',
        color: '#0f172a',
        letterSpacing: -1,
    },
    subtitle: {
        fontSize: 10,
        fontWeight: '700',
        color: '#94a3b8',
        letterSpacing: 2,
        marginTop: 4,
    },
    formContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        borderRadius: 32,
        padding: 24,
        borderWidth: 1,
        borderColor: '#ffffff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.05,
        shadowRadius: 20,
        elevation: 5,
    },
    errorContainer: {
        backgroundColor: '#fff1f2',
        borderWidth: 1,
        borderColor: '#ffe4e6',
        padding: 12,
        borderRadius: 16,
        marginBottom: 16,
    },
    errorText: {
        color: '#e11d48',
        fontSize: 13,
        fontWeight: '700',
        textAlign: 'center',
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 10,
        fontWeight: '700',
        color: '#94a3b8',
        letterSpacing: 1,
        marginBottom: 8,
        marginLeft: 4,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    inputIcon: {
        marginLeft: 16,
    },
    input: {
        flex: 1,
        paddingVertical: 14,
        paddingHorizontal: 12,
        fontSize: 15,
        color: '#0f172a',
        fontWeight: '500',
    },
    row: {
        flexDirection: 'row',
    },
    button: {
        marginTop: 12,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 8,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
    footer: {
        alignItems: 'center',
        marginTop: 32,
        gap: 16,
    },
    footerDivider: {
        width: 40,
        height: 4,
        backgroundColor: '#e2e8f0',
        borderRadius: 2,
    },
    footerText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#cbd5e1',
        letterSpacing: 2,
    },
});
