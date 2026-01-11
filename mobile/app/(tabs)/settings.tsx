import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Switch, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { Settings, Clock, Target, Shield, Bell, Save, Trash2, Calendar, ShieldCheck, Database, Info, ChevronRight } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { strategyApi } from '@/src/services/api';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Theme } from '@/src/constants/Theme';

export default function SettingsScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState({
        entryTime: '12:59',
        exitTime: '15:15',
        targetPnl: 2100,
        stopLossPnl: -1500,
        telegramToken: '',
        telegramChatId: '',
        isVirtual: true
    });
    const [manualExpiries, setManualExpiries] = useState('');
    const [showEntryPicker, setShowEntryPicker] = useState(false);
    const [showExitPicker, setShowExitPicker] = useState(false);

    const fetchSettings = useCallback(async () => {
        try {
            const data = await strategyApi.getState();
            if (data) {
                setSettings({
                    entryTime: data.entryTime || '12:59',
                    exitTime: data.exitTime || '15:15',
                    targetPnl: data.targetPnl || 2100,
                    stopLossPnl: data.stopLossPnl || -1500,
                    telegramToken: data.telegramToken || '',
                    telegramChatId: data.telegramChatId || '',
                    isVirtual: data.isVirtual !== undefined ? data.isVirtual : true
                });
            }

            const expiries = await strategyApi.getManualExpiries();
            if (expiries && Array.isArray(expiries)) {
                setManualExpiries(JSON.stringify({ expiryDates: expiries }, null, 2));
            }
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchSettings();
        setRefreshing(false);
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await strategyApi.updateSettings(settings);
            if (manualExpiries.trim()) {
                try {
                    const parsed = JSON.parse(manualExpiries);
                    let expiries: string[] = [];
                    if (parsed.expiryDates && Array.isArray(parsed.expiryDates)) {
                        expiries = parsed.expiryDates.map((d: string) => d.toUpperCase());
                    } else if (Array.isArray(parsed)) {
                        expiries = parsed.map((d: string) => d.toUpperCase());
                    }

                    if (expiries.length > 0) {
                        await strategyApi.saveManualExpiries(expiries);
                    }
                } catch (e) {
                    Alert.alert('JSON Error', 'Invalid format for manual expiries.');
                    setLoading(false);
                    return;
                }
            }
            Alert.alert('Success', 'Settings saved successfully.');
        } catch (err) {
            console.error('Save failed:', err);
            Alert.alert('Error', 'Failed to update settings.');
        } finally {
            setLoading(false);
        }
    };

    const updateField = (field: string, value: any) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    const parseTimeToDate = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const date = new Date();
        date.setHours(hours || 0, minutes || 0, 0, 0);
        return date;
    };

    const formatTimeToString = (date: Date) => {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    const onEntryTimeChange = (event: any, selectedDate?: Date) => {
        setShowEntryPicker(Platform.OS === 'ios');
        if (selectedDate) {
            updateField('entryTime', formatTimeToString(selectedDate));
        }
    };

    const onExitTimeChange = (event: any, selectedDate?: Date) => {
        setShowExitPicker(Platform.OS === 'ios');
        if (selectedDate) {
            updateField('exitTime', formatTimeToString(selectedDate));
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <View style={styles.header}>
                <Text style={styles.title}>Configuration</Text>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>STRATEGY V1.0</Text>
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.primary} />
                }
            >
                {/* Timing Section */}
                <Animated.View entering={FadeInDown.delay(100).duration(800)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Clock size={18} color={Theme.colors.primary} />
                        <Text style={styles.sectionTitle}>Execution Timing</Text>
                    </View>
                    <View style={styles.grid}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>ENTRY TIME</Text>
                            <TouchableOpacity
                                style={styles.timePickerBtn}
                                onPress={() => setShowEntryPicker(true)}
                            >
                                <Text style={styles.timeValue}>{settings.entryTime}</Text>
                                <ChevronRight size={16} color={Theme.colors.textDim} />
                            </TouchableOpacity>
                            {showEntryPicker && (
                                <DateTimePicker
                                    value={parseTimeToDate(settings.entryTime)}
                                    mode="time"
                                    is24Hour={true}
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    onChange={onEntryTimeChange}
                                />
                            )}
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>EXIT TIME</Text>
                            <TouchableOpacity
                                style={styles.timePickerBtn}
                                onPress={() => setShowExitPicker(true)}
                            >
                                <Text style={styles.timeValue}>{settings.exitTime}</Text>
                                <ChevronRight size={16} color={Theme.colors.textDim} />
                            </TouchableOpacity>
                            {showExitPicker && (
                                <DateTimePicker
                                    value={parseTimeToDate(settings.exitTime)}
                                    mode="time"
                                    is24Hour={true}
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    onChange={onExitTimeChange}
                                />
                            )}
                        </View>
                    </View>
                </Animated.View>

                {/* Risk Management */}
                <Animated.View entering={FadeInDown.delay(200).duration(800)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Target size={18} color={Theme.colors.success} />
                        <Text style={styles.sectionTitle}>Risk Parameters (₹)</Text>
                    </View>
                    <View style={styles.grid}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>TARGET PROFIT</Text>
                            <TextInput
                                style={[styles.input, { color: Theme.colors.success }]}
                                value={settings.targetPnl.toString()}
                                onChangeText={(v) => updateField('targetPnl', parseInt(v) || 0)}
                                keyboardType="numeric"
                            />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>STOP LOSS</Text>
                            <TextInput
                                style={[styles.input, { color: Theme.colors.error }]}
                                value={settings.stopLossPnl.toString()}
                                onChangeText={(v) => updateField('stopLossPnl', parseInt(v) || 0)}
                                keyboardType="numeric"
                            />
                        </View>
                    </View>
                </Animated.View>

                {/* Trading Mode */}
                <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Shield size={18} color={settings.isVirtual ? Theme.colors.primary : Theme.colors.error} />
                        <Text style={styles.sectionTitle}>Trading Environment</Text>
                    </View>
                    <View style={styles.modeContainer}>
                        <View>
                            <Text style={styles.modeLabel}>{settings.isVirtual ? 'Virtual Mode' : 'Live Trading'}</Text>
                            <Text style={styles.modeSub}>{settings.isVirtual ? 'Simulating trades with real-time data' : 'Executing actual orders on broker server'}</Text>
                        </View>
                        <Switch
                            value={settings.isVirtual}
                            onValueChange={(v) => updateField('isVirtual', v)}
                            trackColor={{ false: 'rgba(239, 68, 68, 0.2)', true: 'rgba(59, 130, 246, 0.2)' }}
                            thumbColor={settings.isVirtual ? Theme.colors.primary : Theme.colors.error}
                        />
                    </View>
                </Animated.View>

                {/* Notifications */}
                <Animated.View entering={FadeInDown.delay(400).duration(800)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Bell size={18} color={Theme.colors.warning} />
                        <Text style={styles.sectionTitle}>Telegram Integration</Text>
                    </View>
                    <View style={styles.inputGroupFull}>
                        <Text style={styles.label}>BOT TOKEN</Text>
                        <TextInput
                            style={[styles.input, styles.mono]}
                            value={settings.telegramToken}
                            onChangeText={(v) => updateField('telegramToken', v)}
                            placeholder="Bot Token..."
                            placeholderTextColor={Theme.colors.textDim}
                            secureTextEntry={true}
                        />
                    </View>
                    <View style={styles.inputGroupFull}>
                        <Text style={styles.label}>CHAT ID</Text>
                        <TextInput
                            style={[styles.input, styles.mono]}
                            value={settings.telegramChatId}
                            onChangeText={(v) => updateField('telegramChatId', v)}
                            placeholder="Chat ID..."
                            placeholderTextColor={Theme.colors.textDim}
                        />
                    </View>
                </Animated.View>

                {/* Advanced */}
                <Animated.View entering={FadeInDown.delay(500).duration(800)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Database size={18} color={Theme.colors.textDim} />
                        <Text style={styles.sectionTitle}>Manual Data Overrides</Text>
                    </View>
                    <View style={styles.inputGroupFull}>
                        <Text style={styles.label}>MANUAL EXPIRY DATES (JSON)</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={manualExpiries}
                            onChangeText={setManualExpiries}
                            placeholder='{"expiryDates": ["13-JAN-2026"]}'
                            placeholderTextColor={Theme.colors.textDim}
                            multiline={true}
                            numberOfLines={4}
                        />
                    </View>
                </Animated.View>

                {/* Actions */}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.saveBtn, loading && styles.disabledBtn]}
                        onPress={handleSave}
                        disabled={loading}
                    >
                        <LinearGradient
                            colors={[Theme.colors.primary, Theme.colors.secondary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.saveBtnGradient}
                        >
                            <Save size={18} color="#ffffff" />
                            <Text style={styles.saveBtnText}>{loading ? 'SYNCING...' : 'SAVE & SYNC CONFIG'}</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={styles.infoBox}>
                        <Info size={14} color={Theme.colors.textDim} />
                        <Text style={styles.infoText}>Saving settings will update both Mobile and Web views instantly via common backend.</Text>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: {
        fontSize: 26,
        fontWeight: '900',
        color: Theme.colors.text,
        letterSpacing: -1,
    },
    badge: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: Theme.colors.primary,
        letterSpacing: 0.5,
    },
    scrollContent: {
        paddingTop: 12,
        paddingBottom: 40,
    },
    section: {
        backgroundColor: Theme.colors.surface,
        marginHorizontal: 16,
        marginVertical: 8,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '900',
        color: Theme.colors.text,
        letterSpacing: -0.3,
    },
    grid: {
        flexDirection: 'row',
        gap: 16,
    },
    inputGroup: {
        flex: 1,
    },
    inputGroupFull: {
        marginBottom: 16,
    },
    label: {
        fontSize: 10,
        fontWeight: '800',
        color: Theme.colors.textDim,
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    input: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 14,
        fontWeight: '700',
        color: Theme.colors.text,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    timePickerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    timeValue: {
        fontSize: 15,
        fontWeight: '800',
        color: Theme.colors.text,
        fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    },
    mono: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: 12,
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
        fontSize: 11,
        lineHeight: 18,
    },
    modeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    modeLabel: {
        fontSize: 14,
        fontWeight: '800',
        color: Theme.colors.text,
    },
    modeSub: {
        fontSize: 11,
        color: Theme.colors.textDim,
        fontWeight: '600',
        marginTop: 2,
        maxWidth: 220,
    },
    actions: {
        marginTop: 12,
        paddingHorizontal: 16,
        gap: 16,
    },
    saveBtn: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    disabledBtn: {
        opacity: 0.6,
    },
    saveBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        gap: 10,
    },
    saveBtnText: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 1,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
    },
    infoText: {
        fontSize: 11,
        color: Theme.colors.textDim,
        fontWeight: '600',
        lineHeight: 16,
        flex: 1,
    },
});
