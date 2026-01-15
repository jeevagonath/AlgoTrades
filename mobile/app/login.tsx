import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Image, Modal, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Lock, ShieldCheck, Key, Smartphone, ArrowRight, AlertTriangle } from 'lucide-react-native';
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
    const [passwordExpired, setPasswordExpired] = useState(false);
    const [redirectUrl, setRedirectUrl] = useState<string>('');
    const [focusedInput, setFocusedInput] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        userid: '',
        password: '',
        twoFA: '',
        api_secret: '',
        vendor_code: '',
        imei: ''
    });

    useEffect(() => {
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
        setPasswordExpired(false);

        try {
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
            const errorData = err.response?.data;

            // Check for password expiry
            if (errorData?.code === 'PASSWORD_EXPIRED') {
                setPasswordExpired(true);
                setRedirectUrl(errorData.redirectUrl || 'https://shoonya.finvasia.com/change-password');
                setError(errorData.message || 'Your password has expired. Please change your password.');
            } else {
                setError(errorData?.message || 'Connection error to backend');
            }
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
                            {error && (
                                <Animated.View entering={FadeInDown} style={styles.errorContainer}>
                                    <View style={styles.errorIndicator} />
                                    <Text style={styles.errorText}>{error}</Text>
                                </Animated.View>
                            )}

                            {renderInput("USER IDENTITY", "userid", "Broker User ID", User)}
                            {renderInput("AUTHENTICATION", "password", "Password", Lock, true)}

                            <View style={styles.row}>
                                <View style={{ flex: 1, marginRight: 8 }}>
                                    {renderInput("2FA OTP", "twoFA", "123456", Key, false, "numeric")}
                                </View>
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                    {renderInput("VENDOR CODE", "vendor_code", "VCode", ShieldCheck)}
                                </View>
                            </View>

                            {renderInput("API SECRET", "api_secret", "Enter API Secret", ShieldCheck)}
                            {renderInput("MACHINE ID", "imei", "IMEI / UUID", Smartphone)}

                            <TouchableOpacity
                                style={[styles.button, loading && styles.buttonDisabled]}
                                onPress={handleSubmit}
                                disabled={loading}
                            >
                                <LinearGradient
                                    colors={[Theme.colors.primary, Theme.colors.secondary]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.buttonGradient}
                                >
                                    {loading ? (
                                        <Text style={styles.buttonText}>ESTABLISHING SYNC...</Text>
                                    ) : (
                                        <>
                                            <Text style={styles.buttonText}>UNLOCK ENGINE</Text>
                                            <ArrowRight size={18} color="#ffffff" />
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </Animated.View>

                        <View style={styles.footer}>
                            <View style={styles.footerBadge}>
                                <Text style={styles.footerText}>SECURE QUANT CONNECTION</Text>
                            </View>
                            <Text style={styles.versionText}>CORE ENGINE V1.0.8</Text>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>

            {/* Password Expiry Modal */}
            <Modal
                visible={passwordExpired}
                transparent
                animationType="fade"
                onRequestClose={() => setPasswordExpired(false)}
            >
                <View style={styles.modalOverlay}>
                    <Animated.View entering={FadeInDown.duration(300)} style={styles.modalContent}>
                        <View style={styles.modalIconContainer}>
                            <View style={styles.modalIconCircle}>
                                <AlertTriangle size={32} color="#f59e0b" />
                            </View>
                        </View>

                        <Text style={styles.modalTitle}>Password Expired</Text>
                        <Text style={styles.modalMessage}>
                            {error || 'Your Shoonya password has expired and needs to be changed.'}
                        </Text>

                        <TouchableOpacity
                            style={styles.modalButtonPrimary}
                            onPress={() => {
                                Linking.openURL(redirectUrl);
                            }}
                        >
                            <LinearGradient
                                colors={['#3b82f6', '#2563eb']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.modalButtonGradient}
                            >
                                <Text style={styles.modalButtonTextPrimary}>Change Password on Shoonya</Text>
                                <ArrowRight size={16} color="#ffffff" />
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.modalButtonSecondary}
                            onPress={() => {
                                setPasswordExpired(false);
                                setError(null);
                            }}
                        >
                            <Text style={styles.modalButtonTextSecondary}>Close</Text>
                        </TouchableOpacity>

                        <Text style={styles.modalHint}>
                            After changing your password, return here to login with your new credentials.
                        </Text>
                    </Animated.View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
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
        paddingTop: Platform.OS === 'android' ? 20 : 0,
    },
    header: {
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 32,
    },
    logoContainer: {
        width: 72,
        height: 72,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.03)',
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginBottom: 16,
    },
    logoGradient: {
        flex: 1,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: '900',
        color: Theme.colors.text,
        letterSpacing: -1,
    },
    subtitle: {
        fontSize: 10,
        fontWeight: '800',
        color: Theme.colors.primary,
        letterSpacing: 2,
        marginTop: 4,
    },
    glassCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.5)',
        borderRadius: 32,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        // note: backdropFilter is not native, using semi-transparent bg instead
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        padding: 12,
        borderRadius: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    errorIndicator: {
        width: 4,
        height: 16,
        backgroundColor: Theme.colors.error,
        borderRadius: 2,
        marginRight: 10,
    },
    errorText: {
        color: Theme.colors.error,
        fontSize: 13,
        fontWeight: '700',
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 10,
        fontWeight: '800',
        color: Theme.colors.textDim,
        letterSpacing: 1,
        marginBottom: 8,
        marginLeft: 4,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    inputWrapperFocused: {
        borderColor: Theme.colors.primary,
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
    },
    inputIcon: {
        marginLeft: 16,
    },
    input: {
        flex: 1,
        paddingVertical: 14,
        paddingHorizontal: 12,
        fontSize: 15,
        color: Theme.colors.text,
        fontWeight: '600',
    },
    row: {
        flexDirection: 'row',
    },
    button: {
        marginTop: 12,
        borderRadius: 18,
        overflow: 'hidden',
        elevation: 8,
        shadowColor: Theme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        gap: 10,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1,
    },
    footer: {
        alignItems: 'center',
        marginTop: 32,
    },
    footerBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        marginBottom: 8,
    },
    footerText: {
        fontSize: 9,
        fontWeight: '800',
        color: Theme.colors.textDim,
        letterSpacing: 1,
    },
    versionText: {
        fontSize: 9,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.1)',
        letterSpacing: 1,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        backgroundColor: Theme.colors.background,
        borderRadius: 24,
        padding: 32,
        width: '100%',
        maxWidth: 400,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    modalIconContainer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    modalIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: '900',
        color: Theme.colors.text,
        textAlign: 'center',
        marginBottom: 12,
    },
    modalMessage: {
        fontSize: 14,
        color: Theme.colors.textDim,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    modalButtonPrimary: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 12,
    },
    modalButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 8,
    },
    modalButtonTextPrimary: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '800',
    },
    modalButtonSecondary: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 16,
    },
    modalButtonTextSecondary: {
        color: Theme.colors.textDim,
        fontSize: 14,
        fontWeight: '800',
    },
    modalHint: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.3)',
        textAlign: 'center',
        lineHeight: 16,
    },
});
