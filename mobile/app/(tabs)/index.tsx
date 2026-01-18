import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, RefreshControl, TouchableOpacity, SafeAreaView, Platform, Linking, Alert } from 'react-native';
import { Activity, Bell, Play, Pause, Octagon, Settings, LogOut, Info, Clock, TrendingUp, TrendingDown, ChevronRight, Calendar, Zap, CheckCircle, RotateCcw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MetricCard } from '@/src/components/MetricCard';
import { NiftyTicker } from '@/src/components/NiftyTicker';
import { strategyApi, authApi } from '@/src/services/api';
import { socketService } from '@/src/services/socket';
import { notificationService, AlertData } from '@/src/services/notification.service';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '@/src/context/AuthContext';
import { Theme } from '@/src/constants/Theme';

const EngineWorkflow = ({ status, activity }: { status: string, activity: string }) => {
  const steps = [
    { id: 'EVAL', label: 'Evaluation', desc: '9:00 AM' },
    { id: 'WAIT', label: 'Waiting', desc: 'Non-Expiry' },
    { id: 'EXIT', label: 'Square-off', desc: 'Exit Time' },
    { id: 'SELECT', label: 'Strikes', desc: 'Selection' },
    { id: 'ENTRY', label: 'Entry', desc: 'Orders' },
    { id: 'ACTIVE', label: 'Active', desc: 'Monitoring' },
  ];

  let currentStepIndex = -1;
  const lowerActivity = activity.toLowerCase();

  if (lowerActivity.includes('9 am') || lowerActivity.includes('evaluat')) currentStepIndex = 0;
  else if (status === 'IDLE' && lowerActivity.includes('waiting for expiry')) currentStepIndex = 1;
  else if (status === 'WAITING_FOR_EXPIRY') currentStepIndex = 1;
  else if (status === 'EXIT_DONE' || lowerActivity.includes('exting') || lowerActivity.includes('square-off')) currentStepIndex = 2;
  else if (lowerActivity.includes('select') || lowerActivity.includes('picker')) currentStepIndex = 3;
  else if (status === 'ENTRY_DONE' || lowerActivity.includes('plac') || lowerActivity.includes('entry')) {
    if (status === 'ACTIVE') currentStepIndex = 5;
    else currentStepIndex = 4;
  }
  else if (status === 'ACTIVE') currentStepIndex = 5;

  return (
    <View style={styles.workflowContainer}>
      <Text style={styles.workflowTitle}>Engine Workflow</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.workflowSteps}>
        {steps.map((step, idx) => {
          const isDone = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;
          return (
            <View key={step.id} style={styles.workflowStep}>
              <View style={styles.stepIndicator}>
                <View style={[
                  styles.stepDot,
                  isDone ? { backgroundColor: '#10b981', borderColor: '#10b981' } :
                    isCurrent ? { backgroundColor: '#fff', borderColor: '#3b82f6', borderWidth: 2 } :
                      { backgroundColor: '#fff', borderColor: '#e2e8f0', borderWidth: 1 }
                ]}>
                  {isDone ? <CheckCircle size={10} color="#fff" /> :
                    isCurrent ? <View style={styles.currentDotInner} /> :
                      null}
                </View>
                {idx !== steps.length - 1 && (
                  <View style={[
                    styles.stepLine,
                    { backgroundColor: isDone ? '#10b981' : '#f1f5f9' }
                  ]} />
                )}
              </View>
              <View style={styles.stepContent}>
                <Text style={[
                  styles.stepLabel,
                  isCurrent ? { color: '#3b82f6' } : isDone ? { color: '#1e293b' } : { color: '#94a3b8' }
                ]}>
                  {step.label}
                </Text>
                <Text style={[
                  styles.stepDesc,
                  isCurrent && { color: '#3b82f6', opacity: 1 }
                ]} numberOfLines={1}>
                  {isCurrent ? activity.split(' ')[0] : step.desc}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const TaskTimer = ({ taskText }: { taskText: string }) => {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    const parseTaskTime = (text: string) => {
      if (!text) return null;
      const match = text.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
      if (!match) return null;

      let [_, hours, minutes, ampm] = match;
      let h = parseInt(hours);
      const m = parseInt(minutes);

      if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
      if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;

      const target = new Date();
      target.setHours(h, m, 0, 0);
      return target;
    };

    const updateTimer = () => {
      const target = parseTaskTime(taskText);
      if (!target) {
        setTimeLeft(null);
        return;
      }

      const now = new Date();
      const diff = target.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('Due');
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [taskText]);

  if (!timeLeft) return null;

  return (
    <View style={{
      marginLeft: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      backgroundColor: timeLeft === 'Due' ? '#fff1f2' : '#f0f9ff',
      borderColor: timeLeft === 'Due' ? '#fecaca' : '#bae6fd',
    }}>
      <Text style={{
        fontSize: 10,
        fontWeight: 'bold',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        color: timeLeft === 'Due' ? '#e11d48' : '#0284c7',
      }}>
        {timeLeft !== 'Due' ? `[${timeLeft}]` : timeLeft}
      </Text>
    </View>
  );
};

export default function DashboardScreen() {
  const { logout } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [pnl, setPnl] = useState(0);
  const [peakProfit, setPeakProfit] = useState(0);
  const [peakLoss, setPeakLoss] = useState(0);
  const [status, setStatus] = useState('IDLE');
  const [engineActivity, setEngineActivity] = useState('Engine Ready');
  const [nextAction, setNextAction] = useState('Pending');
  const [isPaused, setIsPaused] = useState(false);
  const [niftyData, setNiftyData] = useState<{ price: number, change: number, changePercent: number, prevClose?: number } | null>(null);
  const [isVirtual, setIsVirtual] = useState(true);
  const [clientName, setClientName] = useState('Trade User');
  const [currentWeekExpiry, setCurrentWeekExpiry] = useState('...');
  const [nextWeekExpiry, setNextWeekExpiry] = useState('...');

  const fetchData = useCallback(async () => {
    try {
      const d = await strategyApi.getState();
      if (d) {
        setPnl(d.pnl || 0);
        setPeakProfit(d.peakProfit || 0);
        setPeakLoss(d.peakLoss || 0);
        setStatus(d.status || (d.isActive ? 'ACTIVE' : 'IDLE'));
        setEngineActivity(d.engineActivity || 'Engine Ready');
        setNextAction(d.nextAction || 'Pending');
        setIsPaused(d.isPaused || false);
        setIsVirtual(d.isVirtual !== undefined ? d.isVirtual : true);
      }

      const niftyRes = await strategyApi.getNiftySpot();
      if (niftyRes.status === 'success' && niftyRes.data) {
        setNiftyData(niftyRes.data);
        socketService.subscribe(['26000']);
      }

      try {
        const clientRes = await authApi.getClient();
        if (clientRes.status === 'success' && clientRes.data) {
          setClientName(clientRes.data.cliname || clientRes.data.uname || clientRes.data.mname || 'Trade User');
        }
      } catch (err) {
        console.warn('Could not fetch client info:', err);
      }

      // Fetch Expiries
      try {
        const expiryRes = await strategyApi.getExpiries();
        if (expiryRes.status === 'success' && expiryRes.data) {
          setCurrentWeekExpiry(expiryRes.data[0] || 'N/A');
          setNextWeekExpiry(expiryRes.data[1] || 'N/A');
        }
      } catch (err) {
        console.error('Failed to fetch expiries:', err);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    }
  }, []);

  useEffect(() => {
    socketService.connect();
    fetchData();

    // Initialize notification service
    notificationService.initialize().catch(err => {
      console.warn('Failed to initialize notifications:', err);
    });

    socketService.on('price_update', (data: any) => {
      if (data.token === '26000') {
        setNiftyData(prev => {
          if (!data.lp || !prev) return prev;
          const price = parseFloat(data.lp);
          const prevClose = prev.prevClose || (price / (1 + (prev.changePercent / 100)));
          const change = price - prevClose;
          const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
          return { price, change, changePercent, prevClose };
        });
      }

      if (data.pnl !== undefined) {
        setPnl(data.pnl);
        if (data.peakProfit !== undefined) setPeakProfit(data.peakProfit);
        if (data.peakLoss !== undefined) setPeakLoss(data.peakLoss);
      }
    });

    socketService.on('state_updated', (data: any) => {
      if (data.status) setStatus(data.status);
      if (data.engineActivity) setEngineActivity(data.engineActivity);
      if (data.nextAction) setNextAction(data.nextAction);
      if (data.isPaused !== undefined) setIsPaused(data.isPaused);
    });

    // Listen for alerts from server
    socketService.onAlert((alert: AlertData) => {
      console.log('Alert received:', alert);

      // Show push notification
      notificationService.showNotification(alert);
    });

    return () => {
      // Cleanuplisteners if needed
    };
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const togglePause = async () => {
    try {
      if (isPaused) {
        await strategyApi.resume();
        setIsPaused(false);
      } else {
        await strategyApi.pause();
        setIsPaused(true);
      }
    } catch (e) {
      console.error('Failed to toggle pause:', e);
    }
  };

  const handleKillSwitch = async () => {
    try {
      await strategyApi.manualExit();
      setStatus('FORCE_EXITED');
      setIsPaused(true);
    } catch (e) {
      console.error('Kill switch failed:', e);
    }
  };

  const handleResetEngine = async () => {
    try {
      await strategyApi.resetEngine();
      // Refresh state
      const d = await strategyApi.getState();
      if (d) {
        setStatus(d.status || 'IDLE');
        setEngineActivity(d.engineActivity || 'Engine Ready');
        setNextAction(d.nextAction || 'Pending');
        setIsPaused(d.isPaused || false);
      }
    } catch (e) {
      console.error('Reset engine failed:', e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome back, {clientName}</Text>
          <Text style={styles.dashboardTitle}>Strategy Dashboard</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <LogOut size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>


      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0f172a" />
        }
      >
        {/* Status Bar */}
        <Animated.View entering={FadeInDown.duration(800)} style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: status === 'ACTIVE' ? '#ecfdf5' : '#f8fafc' }]}>
            <View style={[styles.statusDot, { backgroundColor: status === 'ACTIVE' ? '#10b981' : '#94a3b8' }]} />
            <Text style={[styles.statusText, { color: status === 'ACTIVE' ? '#10b981' : '#64748b' }]}>
              {status.replace(/_/g, ' ')}
            </Text>
          </View>
          <View style={[styles.modeBadge, { backgroundColor: isVirtual ? '#f0f9ff' : '#fff1f2' }]}>
            <Text style={[styles.modeText, { color: isVirtual ? '#0284c7' : '#e11d48' }]}>
              {isVirtual ? 'VIRTUAL' : 'LIVE'} MODE
            </Text>
          </View>
        </Animated.View>

        {/* Nifty Ticker */}
        <Animated.View entering={FadeInDown.delay(100).duration(800)}>
          <NiftyTicker data={niftyData} />
        </Animated.View>

        {/* Expiry Info */}
        <Animated.View entering={FadeInDown.delay(150).duration(800)} style={styles.expiryRow}>
          <View style={styles.expiryItem}>
            <View style={[styles.expiryIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
              <Calendar size={18} color="#3b82f6" />
            </View>
            <View>
              <Text style={styles.expiryLabel}>CURRENT EXPIRY</Text>
              <Text style={styles.expiryValue}>{currentWeekExpiry}</Text>
            </View>
          </View>
          <View style={styles.expiryItem}>
            <View style={[styles.expiryIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Zap size={18} color="#10b981" />
            </View>
            <View>
              <Text style={styles.expiryLabel}>TRADE EXPIRY</Text>
              <Text style={styles.expiryValue}>{nextWeekExpiry}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Primary Metrics */}
        <Animated.View entering={FadeInDown.delay(200).duration(800)} style={styles.metricsGrid}>
          <MetricCard
            label="Total PnL"
            value={pnl}
            type={pnl >= 0 ? 'positive' : 'negative'}
            icon={pnl >= 0 ? TrendingUp : TrendingDown}
            containerStyle={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.metricsGrid}>
          <MetricCard
            label="Peak Profit"
            value={peakProfit}
            type="positive"
            icon={TrendingUp}
            containerStyle={{ flex: 1 }}
          />
          <MetricCard
            label="Peak Loss"
            value={peakLoss}
            type="negative"
            icon={TrendingDown}
            containerStyle={{ flex: 1 }}
          />
        </Animated.View>

        {/* Engine Workflow (NEW) */}
        <Animated.View entering={FadeInDown.delay(350).duration(800)}>
          <EngineWorkflow status={status} activity={engineActivity} />
        </Animated.View>

        {/* Engine Activity Info */}
        <Animated.View entering={FadeInDown.delay(400).duration(800)} style={styles.activityCard}>
          <View style={styles.activityItem}>
            <View style={styles.activityIcon}>
              <Activity size={18} color="#3b82f6" />
            </View>
            <View>
              <Text style={styles.activityLabel}>ENGINE ACTIVITY</Text>
              <Text style={styles.activityValue}>{engineActivity}</Text>
            </View>
          </View>
          <View style={styles.activityDivider} />
          <View style={styles.activityItem}>
            <View style={[styles.activityIcon, { backgroundColor: '#f8fafc' }]}>
              <Clock size={18} color="#64748b" />
            </View>
            <View>
              <Text style={styles.activityLabel}>NEXT TASK</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.activityValue}>{nextAction}</Text>
                <TaskTimer taskText={nextAction} />
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/logs')}
            style={styles.viewLogsBtn}
          >
            <Text style={styles.viewLogsText}>View System Logs</Text>
            <ChevronRight size={14} color="#3b82f6" />
          </TouchableOpacity>
        </Animated.View>

        {/* Control Center */}
        <Animated.View entering={FadeInDown.delay(500).duration(800)} style={styles.controlsContainer}>
          <Text style={styles.sectionTitle}>Control Center</Text>
          <View style={styles.controlsGrid}>
            <TouchableOpacity
              style={styles.controlBtnWrapper}
              onPress={togglePause}
            >
              <LinearGradient
                colors={isPaused ? ['#0f172a', '#1e293b'] : ['#ffffff', '#f8fafc']}
                style={styles.controlBtn}
              >
                {isPaused ? <Play size={24} color="#ffffff" fill="#ffffff" /> : <Pause size={24} color="#64748b" />}
                <Text style={[styles.controlBtnText, { color: isPaused ? '#ffffff' : '#64748b' }]}>
                  {isPaused ? 'RESUME' : 'PAUSE'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlBtnWrapper}
              onPress={handleKillSwitch}
            >
              <LinearGradient
                colors={['#fff1f2', '#ffe4e6']}
                style={styles.controlBtn}
              >
                <Octagon size={24} color="#e11d48" />
                <Text style={[styles.controlBtnText, { color: '#e11d48' }]}>KILL SWITCH</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Reset Engine - Only show when manual reset required */}
          {status === 'FORCE_EXITED' && nextAction === 'Manual Reset Required' && (
            <TouchableOpacity
              style={[styles.controlBtnWrapper, { marginTop: 12, height: 56 }]}
              onPress={handleResetEngine}
            >
              <LinearGradient
                colors={['#eff6ff', '#dbeafe']}
                style={styles.controlBtn}
              >
                <RotateCcw size={22} color="#2563eb" />
                <Text style={[styles.controlBtnText, { color: '#2563eb' }]}>RESET ENGINE</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    paddingBottom: 12,
  },
  welcomeText: {
    fontSize: 13,
    color: Theme.colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dashboardTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: Theme.colors.text,
    letterSpacing: -1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  logoutBtn: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.15)',
  },
  detailValue: {
    color: Theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  statusRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 20,
    gap: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  modeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  modeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.colors.primary,
    letterSpacing: 0.5,
  },
  metricsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  activityCard: {
    backgroundColor: Theme.colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 24,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.1)',
  },
  activityLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  activityValue: {
    fontSize: 16,
    fontWeight: '900',
    color: Theme.colors.text,
    marginTop: 1,
  },
  activityDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  controlsContainer: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Theme.colors.text,
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  controlsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  controlBtnWrapper: {
    flex: 1,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
  },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  controlBtnText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  expiryRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 12,
  },
  expiryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: 12,
  },
  expiryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expiryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.colors.textDim,
    letterSpacing: 0.5,
  },
  expiryValue: {
    color: Theme.colors.text,
    marginTop: 1,
  },
  viewLogsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.03)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.03)',
  },
  viewLogsText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#3b82f6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  workflowContainer: {
    backgroundColor: Theme.colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  workflowTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  workflowSteps: {
    flexDirection: 'row',
    paddingRight: 20,
  },
  workflowStep: {
    width: 80,
    alignItems: 'center',
    marginRight: 4,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  stepLine: {
    height: 2,
    width: 62,
    position: 'absolute',
    left: 49,
    zIndex: 1,
  },
  currentDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3b82f6',
  },
  stepContent: {
    alignItems: 'center',
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 8,
    fontWeight: '600',
    color: '#94a3b8',
    opacity: 0.7,
    textAlign: 'center',
  },
});
