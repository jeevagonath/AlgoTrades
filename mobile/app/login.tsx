import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, Key, Lock, ArrowRight, ExternalLink, Shield } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { authApi } from '@/src/services/api';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useAuth } from '@/src/context/AuthContext';
import { Theme } from '@/src/constants/Theme';

interface InputFieldProps {
    label: string;
    name: string;
    placeholder: string;
    icon: any;
    secure?: boolean;
    keyboard?: string;
    value: string;
    focusedInput: string | null;
    onChangeText: (v: string) => void;
    onFocus: () => void;
    onBlur: () => void;
}

const InputField = ({ label, name, placeholder, icon: Icon, secure = false, keyboard = 'default', value, focusedInput, onChangeText, onFocus, onBlur }: InputFieldProps) => (
    <View style={styles.inputGroup}>
        <Text style={styles.label}>{label}</Text>
        <View
            style={[
                styles.inputWrapper,
                focusedInput === name && styles.inputWrapperFocused
            ]}
        >
            <Icon size={18} color={focusedInput === name ? Theme.colors.primary : Theme.colors.textDim} style={styles.inputIcon} />
            <TextInput
                style={styles.input}
                placeholder={placeholder}
                placeholderTextColor={Theme.colors.textDim}
                value={value}
                onChangeText={onChangeText}
                secureTextEntry={secure}
                keyboardType={keyboard as any}
                autoCapitalize="none"
                onFocus={onFocus}
                onBlur={onBlur}
            />
        </View>
    </View>
);

export default function LoginScreen() {
    const { setIsAuthenticated } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [focusedInput, setFocusedInput] = useState<string | null>(null);
    const [step, setStep] = useState<1 | 2>(1);
    const [formData, setFormData] = useState({
        app_key: '',
        secret_key: '',
        code: ''
    });

    useEffect(() => {
        const loadSavedFields = async () => {
            try {
                const app_key = await AsyncStorage.getItem('shoonya_app_key');
                const secret_key = await AsyncStorage.getItem('shoonya_secret_key');

                setFormData(prev => ({
                    ...prev,
                    app_key: app_key || '',
                    secret_key: secret_key || ''
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

    const handleOpenShoonya = async () => {
        if (!formData.app_key) {
            setError('Please enter your App Key (Client Id) first.');
            return;
        }
        setError(null);
        await AsyncStorage.setItem('shoonya_app_key', formData.app_key);
        await AsyncStorage.setItem('shoonya_secret_key', formData.secret_key);
        
        const baseAppKey = formData.app_key.endsWith('_U') ? formData.app_key.slice(0, -2) : formData.app_key;
        Linking.openURL(`https://trade.shoonya.com/OAuthlogin/inverstor-entry-level/login?api_key=${encodeURIComponent(baseAppKey)}_U&route_to=${encodeURIComponent(baseAppKey)}`);
        setStep(2);
    };

    const handleExchangeToken = async () => {
        if (!formData.code.trim()) {
            setError('Please paste the authorization code from the Shoonya redirect URL.');
            return;
        }
        setLoading(true);
        setError(null);

        try {
            await AsyncStorage.setItem('shoonya_app_key', formData.app_key);
            await AsyncStorage.setItem('shoonya_secret_key', formData.secret_key);

            const res = await authApi.exchangeToken(
                formData.code.trim(),
                formData.app_key.trim(),
                formData.secret_key.trim()
            );
            if (res.status === 'success') {
                setIsAuthenticated(true);
                router.replace('/(tabs)');
            } else {
                setError(res.message || 'Token exchange failed');
            }
        } catch (err: any) {
            const errorData = err.response?.data;
            setError(errorData?.message || 'Connection error to backend');
        } finally {
            setLoading(false);
        }
    };

    const renderInput = (label: string, name: keyof typeof formData, placeholder: string, icon: any, secure = false, keyboard = 'default') => (
        <InputField
            label={label}
            name={name}
            placeholder={placeholder}
            icon={icon}
            secure={secure}
            keyboard={keyboard}
            value={formData[name]}
            focusedInput={focusedInput}
            onChangeText={(v) => handleChange(name, v)}
            onFocus={() => setFocusedInput(name)}
            onBlur={() => setFocusedInput(null)}
        />
    );

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={[Theme.colors.background, '#0f172a', Theme.colors.background]}
                style={StyleSheet.absoluteFillObject}
            />

            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardView}
                >
                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        <Animated.View entering={FadeInDown.duration(1000).springify()} style={styles.header}>
                            <View style={styles.logoContainer}>
                                <LinearGradient
                                    colors={[Theme.colors.primary, Theme.colors.secondary]}
                                    style={styles.logoGradient}
                                >
                                    <ShieldCheck size={32} color="#fff" />
                                </LinearGradient>
                            </View>
                            <Text style={styles.title}>AlgoTrades</Text>
                            <Text style={styles.subtitle}>INSTITUTIONAL GRADE ACCESS</Text>
                        </Animated.View>

                        <Animated.View
                            entering={FadeInUp.delay(200).duration(1000).springify()}
                            style={styles.glassCard}
                        >
                            {/* Step Indicator */}
                            <View style={styles.stepIndicator}>
                                <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]}>
                                    <Text style={styles.stepTextActive}>1</Text>
                                </View>
                                <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
                                <View style={[styles.stepDot, step >= 2 ? styles.stepDotActive : styles.stepDotInactive]}>
                                    <Text style={step >= 2 ? styles.stepTextActive : styles.stepTextInactive}>2</Text>
                                </View>
                            </View>

                            {error && (
                                <Animated.View entering={FadeInDown} style={styles.errorContainer}>
                                    <View style={styles.errorIndicator} />
                                    <Text style={styles.errorText}>{error}</Text>
                                </Animated.View>
                            )}

                            {step === 1 && (
                                <View>
                                    <Text style={styles.stepTitle}>Connect Shoonya</Text>
                                    <Text style={styles.stepDesc}>Enter your API credentials from the Shoonya API Key page, then click Continue to authenticate.</Text>
                                    
                                    {renderInput("APP KEY (CLIENT ID)", "app_key", "Your Shoonya Client Id", Key)}
                                    {renderInput("SECRET CODE", "secret_key", "Secret Code from API page", Lock, true)}

                                    <TouchableOpacity
                                        style={styles.button}
                                        onPress={handleOpenShoonya}
                                    >
                                        <LinearGradient
                                            colors={[Theme.colors.primary, Theme.colors.secondary]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.buttonGradient}
                                        >
                                            <Text style={styles.buttonText}>CONTINUE TO LOGIN</Text>
                                            <ExternalLink size={18} color="#ffffff" />
                                        </LinearGradient>
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.skipLink} onPress={() => { setError(null); setStep(2); }}>
                                        <Text style={styles.skipText}>ALREADY HAVE A CODE? SKIP →</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {step === 2 && (
                                <View>
                                    <Text style={styles.stepTitle}>Paste Auth Code</Text>
                                    <Text style={styles.stepDesc}>After logging in on Shoonya, copy the <Text style={{color: Theme.colors.primary, fontWeight: 'bold'}}>code=</Text> value from the redirect URL and paste it below.</Text>
                                    
                                    {renderInput("AUTHORIZATION CODE", "code", "Paste code from redirect URL...", Shield)}

                                    {(!formData.app_key || !formData.secret_key) && (
                                        <View>
                                            {renderInput("APP KEY (CLIENT ID)", "app_key", "Your Shoonya Client Id", Key)}
                                            {renderInput("SECRET CODE", "secret_key", "Secret Code from API page", Lock, true)}
                                        </View>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.button, loading && styles.buttonDisabled]}
                                        onPress={handleExchangeToken}
                                        disabled={loading}
                                    >
                                        <LinearGradient
                                            colors={[Theme.colors.primary, Theme.colors.secondary]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.buttonGradient}
                                        >
                                            {loading ? (
                                                <Text style={styles.buttonText}>EXCHANGING TOKEN...</Text>
                                            ) : (
                                                <>
                                                    <Text style={styles.buttonText}>UNLOCK ENGINE</Text>
                                                    <ArrowRight size={18} color="#ffffff" />
                                                </>
                                            )}
                                        </LinearGradient>
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.skipLink} onPress={() => { setError(null); setStep(1); setFormData(f => ({...f, code: ''})); }}>
                                        <Text style={styles.skipText}>← BACK</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                        </Animated.View>

                        <View style={styles.footer}>
                            <View style={styles.footerBadge}>
                                <Text style={styles.footerText}>SECURE OAUTH 2.0 FLOW</Text>
                            </View>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Theme.colors.background },
    safeArea: { flex: 1 },
    keyboardView: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40, paddingTop: Platform.OS === 'android' ? 20 : 0 },
    header: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
    logoContainer: { width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.03)', padding: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 16 },
    logoGradient: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 32, fontWeight: '900', color: Theme.colors.text, letterSpacing: -1 },
    subtitle: { fontSize: 10, fontWeight: '800', color: Theme.colors.primary, letterSpacing: 2, marginTop: 4 },
    glassCard: { backgroundColor: 'rgba(30, 41, 59, 0.5)', borderRadius: 32, padding: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    
    stepIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingHorizontal: 20 },
    stepDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    stepDotActive: { backgroundColor: Theme.colors.primary },
    stepDotInactive: { backgroundColor: 'rgba(255,255,255,0.1)' },
    stepLine: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
    stepLineActive: { backgroundColor: Theme.colors.primary },
    stepTextActive: { color: '#fff', fontSize: 12, fontWeight: '900' },
    stepTextInactive: { color: Theme.colors.textDim, fontSize: 12, fontWeight: '900' },

    stepTitle: { color: Theme.colors.text, fontSize: 20, fontWeight: '900', marginBottom: 8 },
    stepDesc: { color: Theme.colors.textDim, fontSize: 12, lineHeight: 18, marginBottom: 24 },

    errorContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: 12, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)' },
    errorIndicator: { width: 4, height: 16, backgroundColor: Theme.colors.error, borderRadius: 2, marginRight: 10 },
    errorText: { color: Theme.colors.error, fontSize: 13, fontWeight: '700', flex: 1 },
    
    inputGroup: { marginBottom: 20 },
    label: { fontSize: 10, fontWeight: '800', color: Theme.colors.textDim, letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    inputWrapperFocused: { borderColor: Theme.colors.primary, backgroundColor: 'rgba(59, 130, 246, 0.05)' },
    inputIcon: { marginLeft: 16 },
    input: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, fontSize: 15, color: Theme.colors.text, fontWeight: '600' },
    
    button: { marginTop: 12, borderRadius: 18, overflow: 'hidden', elevation: 8, shadowColor: Theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
    buttonDisabled: { opacity: 0.6 },
    buttonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 10 },
    buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
    
    skipLink: { marginTop: 24, alignItems: 'center', paddingVertical: 10 },
    skipText: { color: Theme.colors.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 1 },

    footer: { alignItems: 'center', marginTop: 32 },
    footerBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 8 },
    footerText: { fontSize: 9, fontWeight: '800', color: Theme.colors.textDim, letterSpacing: 1 }
});
