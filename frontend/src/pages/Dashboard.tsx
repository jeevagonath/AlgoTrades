import { useEffect, useState, useMemo } from 'react';
import { Activity, ListOrdered, History, Bell, LogOut, TrendingUp, TrendingDown, Clock, Play, Pause, Octagon, Power, Search, Shield, Settings, Save, X, BarChart3, CheckCircle2, Circle, RotateCcw, Code } from 'lucide-react';
import { socketService } from '@/services/socket.service';
import { strategyApi, authApi } from '@/services/api.service';
import { formatTradingViewSymbol, getNiftySpotChartUrl, openTradingViewChart } from '@/utils/tradingview';
import { useAnimatedValue, useFlashOnChange } from '@/hooks/useAnimations';
import { CalendarHeatmap } from '@/components/CalendarHeatmap';
import { PositionDetailsModal } from '@/components/PositionDetailsModal';
import APITester from './APITester';

// --- Types ---

interface LegState {
    token: string;
    symbol: string;
    type: 'CE' | 'PE';
    side: 'BUY' | 'SELL';
    strike: string;
    entryPrice: number;
    ltp: number;
    quantity: number;
    tier?: number;
}

const parseExpiryDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'N/A') throw new Error('Invalid date');
    const [day, month, year] = dateStr.split('-');
    const months: any = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
    return new Date(2000 + parseInt(year), months[month.toUpperCase()], parseInt(day));
};

// --- Animated Sub-components ---

const AnimatedValueText = ({ value, prefix = '₹', className = '', duration = 300, fractionDigits = 2 }: { value: number, prefix?: string, className?: string, duration?: number, fractionDigits?: number }) => {
    const { displayValue } = useAnimatedValue(value, duration);
    return (
        <span className={className}>
            {prefix}{displayValue.toLocaleString('en-IN', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}
        </span>
    );
};

const AnimatedMetricCard = ({
    label,
    value,
    icon: Icon,
    isSignificant = false,
    type = 'neutral',
    className = ''
}: {
    label: string,
    value: number,
    icon?: any,
    isSignificant?: boolean,
    type?: 'positive' | 'negative' | 'neutral',
    className?: string
}) => {
    const { displayValue } = useAnimatedValue(value, 500);
    const isFlashing = useFlashOnChange(value);

    let flashClass = '';
    if (isFlashing) {
        if (type === 'positive') flashClass = 'flash-positive';
        else if (type === 'negative') flashClass = 'flash-negative';
        else flashClass = 'flash-neutral';
    }

    const valueColor = type === 'positive' ? 'text-emerald-600' : type === 'negative' ? 'text-rose-600' : 'text-slate-900';

    return (
        <div className={`bg-white border border-slate-200 rounded-xl p-6 space-y-2 shadow-sm relative overflow-hidden group transition-all duration-200 ${flashClass} ${isSignificant && isFlashing ? 'pulse-update' : ''} ${className}`}>
            <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
                {Icon && <Icon className={`w-4 h-4 transition-colors duration-300 ${type === 'positive' ? 'text-emerald-500' : type === 'negative' ? 'text-rose-500' : 'text-blue-500'}`} />}
            </div>
            <div className={`text-3xl font-black tracking-tighter transition-colors duration-300 ${valueColor}`}>
                ₹{displayValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
        </div>
    );
};

const NiftyTicker = ({ data }: { data: any }) => {
    const { displayValue: animatedPrice } = useAnimatedValue(data.price, 300);
    const isFlashing = useFlashOnChange(data.price);

    return (
        <div className={`bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm overflow-hidden group transition-all duration-200 ${isFlashing ? 'flash-neutral' : ''}`}>
            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NIFTY 50</span>
                <span className="text-lg font-black text-slate-900 font-mono tracking-tighter transition-all duration-300">
                    {animatedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
            </div>
            <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                    <span className={`text-xs font-bold font-mono transition-colors duration-300 ${data.change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {data.change > 0 ? '+' : ''}{data.change.toFixed(2)}
                    </span>
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold mt-1 transition-colors duration-300 ${data.change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {data.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(data.changePercent).toFixed(2)}%
                    </div>
                </div>
                <button
                    onClick={() => openTradingViewChart('NSE:NIFTY')}
                    className="p-2 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                    title="View NIFTY Chart"
                >
                    <BarChart3 className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

const PositionRow = ({ leg }: { leg: LegState }) => {
    const { displayValue: animatedLtp } = useAnimatedValue(leg.ltp, 300);
    const isFlashing = useFlashOnChange(leg.ltp);

    return (
        <tr className={`hover:bg-slate-50/50 transition-all duration-200 ${isFlashing ? 'flash-neutral' : ''}`}>
            <td className="px-6 py-4">
                <div className="font-bold text-sm text-slate-900">{leg.symbol}</div>
                <div className="text-[10px] text-slate-400 font-medium">{leg.token}</div>
            </td>
            <td className="px-6 py-4 text-center">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${leg.side === 'BUY' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                    {leg.side}
                </span>
            </td>
            <td className="px-6 py-4 text-center font-mono text-sm text-slate-600">{leg.strike}</td>
            <td className="px-6 py-4 text-center font-mono text-sm font-bold text-slate-700">{leg.quantity}</td>
            <td className="px-6 py-4 text-center font-mono text-sm text-slate-800">₹{leg.entryPrice || '0.00'}</td>
            <td className={`px-6 py-4 text-right font-mono text-sm font-bold tracking-tight transition-colors duration-300 ${leg.ltp > leg.entryPrice ? (leg.side === 'BUY' ? 'text-emerald-600' : 'text-rose-600') : (leg.side === 'BUY' ? 'text-rose-600' : 'text-emerald-600')}`}>
                ₹{animatedLtp.toFixed(2)}
            </td>
            <td className={`px-6 py-4 text-right font-mono text-sm font-bold ${((leg.ltp - leg.entryPrice) * (leg.side === 'BUY' ? 1 : -1)) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ₹{((leg.ltp - leg.entryPrice) * leg.quantity * (leg.side === 'BUY' ? 1 : -1)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td className="px-6 py-4 text-center">
                <button
                    onClick={() => {
                        const tvSymbol = formatTradingViewSymbol(leg.symbol);
                        if (tvSymbol) {
                            openTradingViewChart(tvSymbol);
                        }
                    }}
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                    title="View Chart"
                >
                    <BarChart3 className="w-4 h-4" />
                </button>
            </td>
        </tr>
    );
};

const EngineWorkflow = ({ status, activity }: { status: string, activity: string }) => {
    const steps = [
        { id: 'EVAL', label: 'Daily Evaluation', desc: '9:00 AM Check', icon: '🔍', color: 'blue' },
        { id: 'WAIT', label: 'Waiting for Expiry', desc: 'Non-expiry Day', icon: '⏳', color: 'amber' },
        { id: 'EXIT', label: 'Square-off', desc: 'Exit Time', icon: '🚪', color: 'orange' },
        { id: 'SELECT', label: 'Strike Selection', desc: 'Strike Picker', icon: '🎯', color: 'purple' },
        { id: 'ENTRY', label: 'Strategy Entry', desc: 'Order Placement', icon: '📝', color: 'indigo' },
        { id: 'ACTIVE', label: 'Monitoring PnL', desc: 'Active Trade', icon: '📊', color: 'green' },
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

    const getStepColor = (color: string, type: 'bg' | 'border' | 'text' | 'ring') => {
        const colors: any = {
            blue: { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600', ring: 'ring-blue-100' },
            amber: { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-600', ring: 'ring-amber-100' },
            orange: { bg: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600', ring: 'ring-orange-100' },
            purple: { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-600', ring: 'ring-purple-100' },
            indigo: { bg: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-600', ring: 'ring-indigo-100' },
            green: { bg: 'bg-green-500', border: 'border-green-500', text: 'text-green-600', ring: 'ring-green-100' },
        };
        return colors[color]?.[type] || colors.blue[type];
    };

    return (
        <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col h-full">
            <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                    Engine Workflow
                </h3>
                <div className="text-[9px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700 uppercase tracking-wide">
                    {status}
                </div>
            </div>

            <div className="space-y-5 flex-1">
                {steps.map((step, idx) => {
                    const isDone = idx < currentStepIndex;
                    const isCurrent = idx === currentStepIndex;
                    const isPending = idx > currentStepIndex;

                    return (
                        <div key={step.id} className={`flex items-start gap-3 relative transition-all duration-300 ${isCurrent ? 'scale-105' : ''}`}>
                            {idx !== steps.length - 1 && (
                                <div className={`absolute left-[13px] top-7 w-[2px] h-5 transition-all duration-500 ${isDone ? 'bg-gradient-to-b from-emerald-500 to-emerald-400' :
                                    isCurrent ? 'bg-gradient-to-b from-blue-500 to-blue-300' :
                                        'bg-slate-200'
                                    }`} />
                            )}

                            <div className={`mt-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-500 text-sm ${isDone ? 'bg-emerald-500 border-emerald-500 shadow-md shadow-emerald-200' :
                                isCurrent ? `bg-white ${getStepColor(step.color, 'border')} ring-4 ${getStepColor(step.color, 'ring')} shadow-md` :
                                    'bg-white border-slate-200'
                                }`}>
                                {isDone ? (
                                    <CheckCircle2 className="w-4 h-4 text-white" />
                                ) : isCurrent ? (
                                    <span className="animate-pulse">{step.icon}</span>
                                ) : (
                                    <span className="opacity-30">{step.icon}</span>
                                )}
                            </div>

                            <div className="flex-1 pt-0.5">
                                <div className={`text-xs font-bold leading-tight transition-colors duration-300 ${isCurrent ? getStepColor(step.color, 'text') :
                                    isDone ? 'text-slate-700' :
                                        'text-slate-400'
                                    }`}>
                                    {step.label}
                                </div>

                                <div className={`text-[10px] font-medium mt-1 leading-tight ${isCurrent ? 'text-slate-600' : 'text-slate-400'
                                    }`}>
                                    {isCurrent ? (
                                        <div className="flex items-center gap-1">
                                            <div className="w-1 h-1 rounded-full bg-blue-500 animate-ping"></div>
                                            <span className="font-semibold">{activity}</span>
                                        </div>
                                    ) : (
                                        step.desc
                                    )}
                                </div>

                                {isCurrent && (
                                    <div className="mt-2">
                                        <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                                            <div className={`h-full ${getStepColor(step.color, 'bg')} animate-pulse`} style={{ width: '60%' }}></div>
                                        </div>
                                    </div>
                                )}

                                {isDone && (
                                    <div className="mt-1 text-[9px] text-emerald-600 font-semibold flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Completed
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const TaskTimer = ({ taskText }: { taskText: string }) => {
    const [timeLeft, setTimeLeft] = useState<string | null>(null);

    useEffect(() => {
        const parseTaskTime = (text: string) => {
            const match = text.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
            if (!match) return null;

            let [_, hours, minutes, ampm] = match;
            let h = parseInt(hours);
            const m = parseInt(minutes);

            if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
            if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;

            const target = new Date();
            target.setHours(h, m, 0, 0);

            // If target time has already passed today, assume it's for tomorrow? 
            // In trading context, usually we just show it's passed or it refers to today's schedule.
            // For 12:45 PM, if it's 1:00 PM, it's passed.
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
        <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border animate-pulse ${timeLeft === 'Due'
            ? 'bg-rose-50 text-rose-600 border-rose-100'
            : 'bg-blue-50 text-blue-600 border-blue-100'
            }`}>
            {timeLeft !== 'Due' ? `[${timeLeft}]` : timeLeft}
        </span>
    );
};

const Dashboard = ({ onLogout }: { onLogout: () => void }) => {
    const [pnl, setPnl] = useState(0);
    const [peakProfit, setPeakProfit] = useState(0);
    const [peakLoss, setPeakLoss] = useState(0);
    const [requiredMargin, setRequiredMargin] = useState(0);
    const [availableMargin, setAvailableMargin] = useState(0);
    const [testStrikes, setTestStrikes] = useState<any[]>([]);
    const [testing, setTesting] = useState(false);
    const [logs, setLogs] = useState<{ time: string, msg: string }[]>([]);
    const [orders, setOrders] = useState<any[]>([]); // New Order State
    const [alerts, setAlerts] = useState<any[]>([]); // Alerts State


    const [expiries, setExpiries] = useState<string[]>([]);
    const [selectedExpiry, setSelectedExpiry] = useState<string>('');
    const [expiryApproved, setExpiryApproved] = useState(false);
    const [currentWeekExpiry, setCurrentWeekExpiry] = useState<string>('');
    const [nextWeekExpiry, setNextWeekExpiry] = useState<string>('');
    const [isExpiryDay, setIsExpiryDay] = useState(false);

    const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'logs' | 'alerts' | 'pnl' | 'api'>('positions');
    const [dailyPnL, setDailyPnL] = useState<any[]>([]);
    const [showPositionModal, setShowPositionModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedPositions, setSelectedPositions] = useState<any[]>([]);
    const [selectedPnL, setSelectedPnL] = useState(0);

    // Date filter state - default to last 4 months
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 4);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

    // Summary metrics state
    const [pnlSummary, setPnlSummary] = useState({
        totalPnl: 0,
        charges: 0,
        credits: 0,
        netPnl: 0
    });

    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({
        entryTime: '12:59',
        exitTime: '15:15',
        reEntryCutoffTime: '13:45',
        targetPnl: 2100,
        stopLossPnl: -1500,
        telegramToken: '',
        telegramChatId: '',
        isVirtual: true
    });
    const [status, setStatus] = useState<string>('IDLE');
    const [engineActivity, setEngineActivity] = useState<string>('Initializing...');
    const [nextAction, setNextAction] = useState<string>('Waiting for data...');
    const [isPaused, setIsPaused] = useState(false);
    const [manualExpiriesText, setManualExpiriesText] = useState('');
    const [niftyData, setNiftyData] = useState<{ price: number, change: number, changePercent: number, prevClose?: number } | null>(null);
    const [clientName, setClientName] = useState('Trade User');
    const [clientDetails, setClientDetails] = useState<any>(null);
    const [userDetails, setUserDetails] = useState<any>(null);
    const [margins, setMargins] = useState<any>(null);
    const [showClientModal, setShowClientModal] = useState(false);

    // Dynamic PnL calculation from individual legs
    const realTimePnL = useMemo(() => {
        if (!testStrikes || testStrikes.length === 0) return pnl;
        return testStrikes.reduce((acc, leg) => {
            const multiplier = leg.side === 'BUY' ? 1 : -1;
            const legPnL = (leg.ltp - (leg.entryPrice || 0)) * (leg.quantity || 0) * multiplier;
            return acc + legPnL;
        }, 0);
    }, [testStrikes, pnl]);

    useEffect(() => {
        socketService.connect();

        const fetchData = async () => {
            try {
                // 1. Fetch Initial State
                const d = await strategyApi.getState();
                if (d) {
                    if (d.selectedStrikes) setTestStrikes(d.selectedStrikes);
                    setPnl(d.pnl || 0);
                    setPeakProfit(d.peakProfit || 0);
                    setPeakLoss(d.peakLoss || 0);
                    setRequiredMargin(d.requiredMargin || 0);
                    setAvailableMargin(d.availableMargin || 0);
                    setSettings({
                        entryTime: d.entryTime || '12:59',
                        exitTime: d.exitTime || '15:15',
                        reEntryCutoffTime: d.reEntryCutoffTime || '13:45',
                        targetPnl: d.targetPnl || 2100,
                        stopLossPnl: d.stopLossPnl || -1500,
                        telegramToken: d.telegramToken || '8494833053:AAHdVkSIgis5H-TcKnUi-LmOTJm67A8qILc',
                        telegramChatId: d.telegramChatId || '5177480141',
                        isVirtual: d.isVirtual !== undefined ? d.isVirtual : true
                    });
                    setStatus(d.status || (d.isActive ? 'ACTIVE' : 'IDLE'));
                    setEngineActivity(d.engineActivity || 'Engine Ready');
                    setNextAction(d.nextAction || 'Pending');
                    setIsPaused(d.isPaused || false);
                    if (d.isActive) setExpiryApproved(true);
                }

                // 2. Fetch Expiries
                const expiryRes = await strategyApi.getExpiries();
                if (expiryRes.status === 'success' && expiryRes.data) {
                    setExpiries(expiryRes.data);
                    if (expiryRes.data.length > 0) {
                        setCurrentWeekExpiry(expiryRes.data[0]);
                        setNextWeekExpiry(expiryRes.data[1] || 'N/A');
                        setSelectedExpiry(expiryRes.data[0]);

                        // Check if today is expiry day
                        try {
                            const today = new Date();
                            const expiryDate = parseExpiryDate(expiryRes.data[0]);
                            setIsExpiryDay(today.toDateString() === expiryDate.toDateString());
                        } catch (err) {
                            console.error('Failed to parse expiry date:', err);
                        }
                    }
                }

                // 3. Fetch Historical Logs
                const logsRes = await strategyApi.getLogs();
                if (logsRes) {
                    setLogs(logsRes.map((l: any) => ({ time: l.time, msg: l.msg })));
                }

                // 4. Fetch NIFTY Spot
                try {
                    const niftyRes = await strategyApi.getNiftySpot();
                    if (niftyRes.status === 'success' && niftyRes.data) {
                        setNiftyData(niftyRes.data);
                        // Subscribe to NIFTY token (26000)
                        socketService.subscribe(['26000']);
                    }
                } catch (err) {
                    console.error('Failed to fetch NIFTY spot:', err);
                }

                // Fetch Account & Client Info
                try {
                    const [cRes, uRes, mRes] = await Promise.all([
                        authApi.getClient(),
                        authApi.getUser(),
                        authApi.getMargins()
                    ]);

                    if (cRes.status === 'success' && cRes.data) {
                        setClientName(cRes.data.cliname || cRes.data.uname || cRes.data.mname || 'Trade User');
                        setClientDetails(cRes.data);
                    }
                    if (uRes.status === 'success' && uRes.data) {
                        setUserDetails(uRes.data);
                    }
                    if (mRes.status === 'success' && mRes.data) {
                        setMargins(mRes.data);
                    }
                } catch (err) {
                    console.error('Failed to fetch account info:', err);
                }

                // 5. Fetch Orders
                try {
                    const ordersRes = await strategyApi.getOrders();
                    if (ordersRes.status === 'success') {
                        setOrders(ordersRes.data);
                    }
                } catch (err) {
                    console.error('Failed to fetch orders:', err);
                }

                // 6. Fetch Alerts
                try {
                    const alertsRes = await strategyApi.getAlerts();
                    if (alertsRes.status === 'success') {
                        setAlerts(alertsRes.data);
                    }
                } catch (err) {
                    console.error('Failed to fetch alerts:', err);
                }

            } catch (err) {
                console.error('Failed to fetch data:', err);
            }
        };
        fetchData();

        socketService.on('price_update', (data: any) => {
            // Check for NIFTY update
            if (data.token === '26000') {
                setNiftyData(prev => {
                    if (!data.lp) return prev;
                    if (!prev) return prev; // Wait for initial fetch

                    const price = parseFloat(data.lp);
                    // Use prevClose from state if available
                    const prevClose = prev.prevClose || (price / (1 + (prev.changePercent / 100)));

                    const change = price - prevClose;
                    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

                    return {
                        price,
                        change,
                        changePercent,
                        prevClose
                    };
                });
                return;
            }

            //console.log('[Dashboard] Price Update:', data);
            // Update individual leg LTP in the table
            setTestStrikes(prev => prev.map(leg =>
                leg.token === data.token ? { ...leg, ltp: data.ltp } : leg
            ));

            // System updates PnL as well
            if (data.pnl !== undefined) {
                setPnl(data.pnl);
                if (data.peakProfit !== undefined) setPeakProfit(data.peakProfit);
                if (data.peakLoss !== undefined) setPeakLoss(data.peakLoss);
            }
        });
        socketService.on('system_log', (data: any) => {
            setLogs(prev => [{ time: data.time, msg: data.msg }, ...prev].slice(0, 75));
        });

        // Real-time alerts listener
        socketService.on('new_alert', (data: any) => {
            setAlerts(prev => [data, ...prev].slice(0, 50));
        });

        // Real-time orders listener
        socketService.on('new_order', (data: any) => {
            setOrders(prev => [data, ...prev].slice(0, 100));
        });

        // Real-time positions listener
        socketService.on('positions_updated', (data: any) => {
            if (Array.isArray(data)) {
                setTestStrikes(data);
            }
        });

        // Real-time engine state listener
        socketService.on('state_updated', (data: any) => {
            if (data.status) setStatus(data.status);
            if (data.engineActivity) setEngineActivity(data.engineActivity);
            if (data.nextAction) setNextAction(data.nextAction);
            if (data.isPaused !== undefined) setIsPaused(data.isPaused);
        });

        socketService.on('strategy_exit', (data: any) => {
            addLog(`Strategy Exit: ${data.reason}`);
            setTestStrikes([]);
            setPnl(0);
        });

        socketService.on('strategy_state', (data: any) => {
            if (data.status) setStatus(data.status);
            if (data.engineActivity) setEngineActivity(data.engineActivity);
            if (data.nextAction) setNextAction(data.nextAction);
            if (data.pnl !== undefined) setPnl(data.pnl);
            if (data.peakProfit !== undefined) setPeakProfit(data.peakProfit);
            if (data.peakLoss !== undefined) setPeakLoss(data.peakLoss);
            if (data.requiredMargin !== undefined) setRequiredMargin(data.requiredMargin);
            if (data.availableMargin !== undefined) setAvailableMargin(data.availableMargin);
            if (data.isPaused !== undefined) setIsPaused(data.isPaused);
        });

        return () => {
            // Cleanup socket listeners if needed
            socketService.off('system_log');
            socketService.off('strategy_state');
        };
    }, []);

    // Fetch daily P&L data when pnl tab is active or date filter changes
    useEffect(() => {
        if (activeTab === 'pnl') {
            const fetchDailyPnL = async () => {
                try {
                    // Add 1 day buffer to end date to include today's trades
                    const adjustedEnd = new Date(endDate);
                    adjustedEnd.setDate(adjustedEnd.getDate() + 1);
                    const adjustedEndStr = adjustedEnd.toISOString().split('T')[0];

                    console.log('📅 Fetching P&L from:', startDate, 'to:', adjustedEndStr);
                    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'https://algotradesservice.onrender.com/api'}/analytics/daily-pnl?startDate=${startDate}&endDate=${adjustedEndStr}`);
                    console.log('Response status:', res.status);
                    const data = await res.json();
                    console.log('API Response:', data);
                    if (data.status === 'success') {
                        setDailyPnL(data.data || []);

                        // Calculate summary metrics from filtered data
                        const totalPnl = (data.data || []).reduce((sum: number, day: any) => sum + (day.pnl || 0), 0);
                        console.log('💰 Total P&L for date range:', totalPnl);
                        setPnlSummary({
                            totalPnl,
                            charges: 0, // TODO: Add from database if tracked
                            credits: 0, // TODO: Add from database if tracked
                            netPnl: totalPnl
                        });
                    }
                } catch (err) {
                    console.error('Failed to fetch daily P&L:', err);
                }
            };
            fetchDailyPnL();
        }
    }, [activeTab, startDate, endDate]);

    // Handle calendar date click to show position details
    const handleDateClick = async (date: string, tradeIds: string[], pnl: number) => {
        console.log('📅 Date clicked:', date, 'Trade IDs:', tradeIds, 'P&L:', pnl);
        try {
            if (tradeIds.length > 0) {
                const url = `${import.meta.env.VITE_API_BASE_URL || 'https://algotradesservice.onrender.com/api'}/analytics/trade-positions/${tradeIds[0]}`;
                console.log('🔍 Fetching positions from:', url);
                const res = await fetch(url);
                const data = await res.json();
                console.log('📊 Positions API response:', data);
                if (data.status === 'success') {
                    console.log('✅ Opening modal with positions:', data.data);
                    setSelectedDate(date);
                    setSelectedPositions(data.data || []);
                    setSelectedPnL(pnl);
                    setShowPositionModal(true);
                } else {
                    console.error('❌ API returned error:', data);
                }
            } else {
                console.warn('⚠️ No trade IDs provided');
            }
        } catch (err) {
            console.error('❌ Failed to fetch positions:', err);
        }
    };

    const handleLogout = () => {
        onLogout();
    };

    useEffect(() => {
        const fetchExpiries = async () => {
            try {
                const res = await strategyApi.getExpiries();
                if (res.status === 'success' && res.data.length > 0) {
                    setExpiries(res.data);
                    setSelectedExpiry(res.data[0]);
                }
            } catch (err) {
                console.error('Failed to fetch expiries:', err);
            }
        };
        fetchExpiries();
    }, []);

    const addLog = (msg: string) => {
        const time = new Date().toLocaleTimeString('en-GB', { hour12: false }).split(' ')[0];
        setLogs(prev => [{ time, msg }, ...prev].slice(0, 75));
    };

    // Helper: Parse expiry date string (e.g., "09-JAN-2026") to Date
    const parseExpiryDate = (dateStr: string): Date => {
        const months: { [key: string]: number } = {
            'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
            'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
        };
        const parts = dateStr.split('-');
        const day = parseInt(parts[0]);
        const month = months[parts[1]];
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
    };

    const handleTestStrategy = async () => {
        if (!expiryApproved) {
            addLog('Please approve the selected expiry first.');
            return;
        }
        setTesting(true);
        addLog(`Manual strike selection triggered for expiry: ${selectedExpiry}...`);
        try {
            const res = await strategyApi.testSelection(selectedExpiry);
            if (res.status === 'success') {
                setTestStrikes(res.data);
                addLog(`Success: Found ${res.data.length} potential strikes for ${selectedExpiry}.`);
            }
        } catch (err: any) {
            addLog(`Error: ${err.message || 'Failed to select strikes'}`);
        } finally {
            setTesting(false);
        }
    };

    const handleSaveSettings = async () => {
        try {
            await strategyApi.updateSettings(settings);

            // Save manual expiries if provided
            if (manualExpiriesText.trim()) {
                try {
                    const parsed = JSON.parse(manualExpiriesText);

                    // Check if it's NSE format with expiryDates field
                    let expiries: string[];
                    if (parsed.expiryDates && Array.isArray(parsed.expiryDates)) {
                        // NSE format: {"expiryDates": ["13-Jan-2026", ...]}
                        expiries = parsed.expiryDates.map((date: string) => date.toUpperCase());
                    } else if (Array.isArray(parsed)) {
                        // Direct array format: ["13-JAN-2026", ...]
                        expiries = parsed.map((date: string) => date.toUpperCase());
                    } else {
                        addLog('Error: Invalid format. Use NSE JSON or array of dates');
                        return;
                    }

                    await strategyApi.saveManualExpiries(expiries);
                    addLog(`✅ Manual expiries saved: ${expiries.length} dates`);
                } catch (err) {
                    addLog('❌ Error: Invalid JSON format for manual expiries');
                }
            }

            addLog('Settings saved successfully.');
            setShowSettings(false);
        } catch (err: any) {
            addLog(`Error saving settings: ${err.message}`);
        }
    };

    const handleExecuteOrders = async () => {
        setTesting(true);
        addLog('Executing orders in sequence (Longs -> Shorts)...');
        try {
            const res = await strategyApi.placeOrder();
            if (res.status === 'success') {
                addLog('Success: All legs executing virtually.');
                // Refresh state to show positions
                const state = await strategyApi.getState();
                if (state && state.selectedStrikes) {
                    setTestStrikes(state.selectedStrikes);
                    addLog('System monitoring active.');
                }
            }
        } catch (err: any) {
            addLog(`Execution Error: ${err.message || 'Failed to place orders'}`);
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f8f9fc] text-slate-900 flex flex-col font-sans">
            {/* Minimalist Top Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1 bg-white border border-slate-100 rounded-lg shadow-sm overflow-hidden">
                                <img src="/logo.png" alt="Logo" className="w-7 h-7 object-contain" />
                            </div>
                            <span className="text-lg font-bold tracking-tight text-slate-900">
                                AlgoTrades
                            </span>
                        </div>

                        {/* Global Status Badge */}
                        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors ${status === 'ACTIVE' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                            status === 'ENTRY_DONE' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                status === 'EXIT_DONE' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                    status === 'FORCE_EXITED' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                                        'bg-slate-50 border-slate-200 text-slate-600'
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {status.replace(/_/g, ' ')}
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        {/* Control Center */}
                        <div className="flex items-center gap-4">
                            {/* Control Center */}
                            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
                                {/* Pause/Resume */}
                                <button
                                    onClick={async () => {
                                        try {
                                            if (isPaused) {
                                                await strategyApi.resume();
                                                addLog('▶️ Sent RESUME command.');
                                                setIsPaused(false);
                                            } else {
                                                await strategyApi.pause();
                                                addLog('⏸️ Sent PAUSE command.');
                                                setIsPaused(true);
                                            }
                                        } catch (e: any) { addLog(`Error: ${e.message}`); }
                                    }}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${isPaused
                                        ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-sm'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                        }`}
                                >
                                    {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
                                    {isPaused ? 'RESUME' : 'PAUSE'}
                                </button>

                                {/* Kill Switch */}
                                <button
                                    onClick={async () => {
                                        if (!confirm('🛑 FORCE EXIT all positions?')) return;
                                        try {
                                            await strategyApi.manualExit();
                                            setIsPaused(true);
                                            setStatus('FORCE_EXITED');
                                            addLog('✅ Kill Switch Executed.');
                                        } catch (e: any) { addLog(`❌ failed: ${e.message}`); }
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-all text-[10px] font-bold"
                                >
                                    <Octagon className="w-3.5 h-3.5" />
                                    KILL SWITCH
                                </button>

                                {/* Reset Engine - Only show when manual reset required */}
                                {status === 'FORCE_EXITED' && nextAction === 'Manual Reset Required' && (
                                    <button
                                        onClick={async () => {
                                            if (!confirm('🔄 Reset engine to IDLE state?\n\nThis will clear the FORCE_EXITED status and allow the strategy to resume normal operation.')) return;
                                            try {
                                                await strategyApi.resetEngine();
                                                addLog('✅ Engine reset successfully');
                                                // Refresh state
                                                const d = await strategyApi.getState();
                                                if (d) {
                                                    setStatus(d.status || 'IDLE');
                                                    setEngineActivity(d.engineActivity || 'Engine Ready');
                                                    setNextAction(d.nextAction || 'Pending');
                                                    setIsPaused(d.isPaused || false);
                                                }
                                            } catch (e: any) {
                                                addLog(`❌ Reset failed: ${e.message}`);
                                            }
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-all text-[10px] font-bold"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        RESET ENGINE
                                    </button>
                                )}
                            </div>

                            {/* Navigation Tabs */}
                            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                                {[
                                    { id: 'positions', label: 'Positions', icon: ListOrdered },
                                    { id: 'orders', label: 'Orders', icon: History },
                                    { id: 'pnl', label: 'P&L Analytics', icon: BarChart3 },
                                    { id: 'alerts', label: 'Alerts', icon: Bell },
                                    { id: 'logs', label: 'Logs', icon: Activity }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${activeTab === tab.id
                                            ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            {tab.icon && <tab.icon className="w-3 h-3" />}
                                            {tab.label}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="w-px h-6 bg-slate-200" />

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowClientModal(true)}
                                    className="p-2 rounded-lg border bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                    title="Account Details"
                                >
                                    <Shield className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    className={`p-2 rounded-lg border transition-all ${showSettings
                                        ? 'bg-blue-50 border-blue-200 text-blue-600'
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-rose-600 transition-colors text-[10px] font-bold uppercase tracking-wider"
                                >
                                    <LogOut className="w-3.5 h-3.5" />
                                    Logout
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </nav >

            {/* Settings Overlay */}
            {showSettings && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-2xl p-8 space-y-8 animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold flex items-center gap-3 text-slate-900">
                                <Settings className="text-blue-600" />
                                Strategy Settings
                            </h2>
                            <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Entry Time</label>
                                    <input
                                        type="time"
                                        value={settings.entryTime}
                                        onChange={e => setSettings({ ...settings, entryTime: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-bold text-blue-600 outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Exit Time</label>
                                    <input
                                        type="time"
                                        value={settings.exitTime}
                                        onChange={e => setSettings({ ...settings, exitTime: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-bold text-blue-600 outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                    Re-Entry Cutoff Time
                                    <span className="ml-2 text-[9px] normal-case text-slate-400">(Positions closed before this time are eligible for re-entry)</span>
                                </label>
                                <input
                                    type="time"
                                    value={settings.reEntryCutoffTime || '13:45'}
                                    onChange={e => setSettings({ ...settings, reEntryCutoffTime: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-bold text-purple-600 outline-none focus:border-purple-500 transition-colors"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Target Profit (₹)</label>
                                <input
                                    type="number"
                                    value={settings.targetPnl}
                                    onChange={e => setSettings({ ...settings, targetPnl: parseInt(e.target.value) })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-bold text-emerald-600 outline-none focus:border-emerald-500 transition-colors"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Stop Loss (₹)</label>
                                <input
                                    type="number"
                                    value={settings.stopLossPnl}
                                    onChange={e => setSettings({ ...settings, stopLossPnl: parseInt(e.target.value) })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-bold text-rose-600 outline-none focus:border-rose-500 transition-colors"
                                />
                            </div>

                            <div className="h-px bg-slate-100 my-2" />

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Trading Mode</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setSettings({ ...settings, isVirtual: true })}
                                        className={`py-2.5 px-4 rounded-lg font-bold text-xs transition-all ${settings.isVirtual
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'
                                            }`}
                                    >
                                        🧪 Virtual
                                    </button>
                                    <button
                                        onClick={() => setSettings({ ...settings, isVirtual: false })}
                                        className={`py-2.5 px-4 rounded-lg font-bold text-xs transition-all ${!settings.isVirtual
                                            ? 'bg-rose-600 text-white shadow-md'
                                            : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'
                                            }`}
                                    >
                                        💰 Live
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider text-slate-500">Telegram Bot Token</label>
                                    <input
                                        type="text"
                                        value={settings.telegramToken}
                                        onChange={e => setSettings({ ...settings, telegramToken: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs font-mono text-slate-600 outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider text-slate-500">Telegram Chat ID</label>
                                    <input
                                        type="text"
                                        value={settings.telegramChatId}
                                        onChange={e => setSettings({ ...settings, telegramChatId: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs font-mono text-slate-600 outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider flex items-center gap-2">
                                    📅 Manual Expiry Dates
                                </label>
                                <textarea
                                    value={manualExpiriesText}
                                    onChange={e => setManualExpiriesText(e.target.value)}
                                    placeholder='{"expiryDates":["13-Jan-2026","20-Jan-2026", "27-Jan-2026"]}'
                                    rows={4}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs font-mono text-slate-600 outline-none focus:border-blue-500 transition-colors resize-none"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSaveSettings}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg"
                        >
                            <Save className="w-4 h-4" />
                            Save Configuration
                        </button>
                    </div>
                </div>
            )}

            <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 space-y-6 relative z-10">
                {/* Header Info Row */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-black shadow-lg shadow-blue-200">
                                {(clientName || 'U').charAt(0).toUpperCase()}
                            </div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase">
                                Welcome, {clientName}
                            </h1>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-slate-500 text-xs font-medium">Monitoring</span>
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold border border-blue-100 uppercase">Iron Condor</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${settings.isVirtual ? 'bg-sky-50 text-sky-700 border-sky-100' : 'bg-rose-50 text-rose-700 border-rose-100'} uppercase`}>
                                {settings.isVirtual ? 'Virtual' : 'LIVE'} Mode
                            </span>
                        </div>
                    </div>

                    {/* Expiry Display */}
                    <div className="flex flex-wrap items-center gap-3">
                        {currentWeekExpiry && (
                            <div className={`flex items-center gap-2 px-3 py-1.5 bg-white border rounded-lg shadow-sm ${isExpiryDay ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'}`}>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Week</span>
                                <span className={`text-xs font-bold font-mono ${isExpiryDay ? 'text-rose-600' : 'text-slate-700'}`}>
                                    {currentWeekExpiry}
                                    {isExpiryDay && ' 🔔'}
                                </span>
                            </div>
                        )}
                        {nextWeekExpiry && nextWeekExpiry !== 'N/A' && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
                                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Target Expiry</span>
                                <span className="text-xs font-bold font-mono text-blue-700">
                                    {nextWeekExpiry}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Strategy Monitoring Bar (NEW) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-center gap-8 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg">
                                <Activity className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Engine Activity</div>
                                <div className="text-sm font-bold text-slate-700">{engineActivity || 'Ready'}</div>
                            </div>
                        </div>
                        <div className="hidden md:block w-px h-8 bg-slate-100" />
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <Clock className="w-4 h-4 text-slate-500" />
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Next Task</div>
                                <div className="text-sm font-bold text-slate-700">
                                    {nextAction || 'Pending'}
                                    <TaskTimer taskText={nextAction} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* NIFTY Ticker Card */}
                    {niftyData && <NiftyTicker data={niftyData} />}
                </div>

                {/* Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* 1. Total PnL - Main Focus */}
                    <div className="md:col-span-2">
                        <AnimatedMetricCard
                            label="Total PnL"
                            value={realTimePnL}
                            icon={realTimePnL >= 0 ? TrendingUp : TrendingDown}
                            type={realTimePnL >= 0 ? 'positive' : 'negative'}
                            isSignificant={Math.abs(realTimePnL) > 100}
                        />
                    </div>

                    {/* 2. Margin Stats */}
                    <div className="md:col-span-2 grid grid-cols-2 gap-4">
                        <AnimatedMetricCard
                            label="Required Margin"
                            value={requiredMargin}
                            icon={Shield}
                            className="bg-white"
                        />
                        <AnimatedMetricCard
                            label="Available Margin"
                            value={availableMargin}
                            icon={CheckCircle2}
                            type={availableMargin < requiredMargin ? 'negative' : 'neutral'}
                            className="bg-white"
                        />
                    </div>
                    <AnimatedMetricCard
                        label="Peak Profit"
                        value={peakProfit}
                        icon={TrendingUp}
                        type="positive"
                    />
                    <AnimatedMetricCard
                        label="Peak Loss"
                        value={peakLoss}
                        icon={TrendingDown}
                        type="negative"
                    />
                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2 shadow-sm group">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-blue-500" />
                            Next Expiry
                        </div>
                        <div className="text-3xl font-black text-slate-900 tracking-tighter">
                            {nextWeekExpiry && nextWeekExpiry !== 'N/A' ? (
                                (() => {
                                    try {
                                        return parseExpiryDate(nextWeekExpiry).toLocaleDateString('en-IN', { weekday: 'long' });
                                    } catch (e) {
                                        return 'N/A';
                                    }
                                })()
                            ) : 'N/A'}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content Area */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                <h2 className="font-bold text-xs uppercase tracking-wider flex items-center gap-2 text-slate-700">
                                    {activeTab === 'positions' && <ListOrdered className="w-4 h-4 text-blue-600" />}
                                    {activeTab === 'orders' && <History className="w-4 h-4 text-blue-600" />}
                                    {activeTab === 'alerts' && <Bell className="w-4 h-4 text-blue-600" />}
                                    {activeTab === 'logs' && <Activity className="w-4 h-4 text-blue-600" />}
                                    {activeTab === 'pnl' && <BarChart3 className="w-4 h-4 text-blue-600" />}
                                    {activeTab === 'positions' ? 'Active Positions' : activeTab === 'orders' ? 'Order History' : activeTab === 'alerts' ? 'System Alerts' : activeTab === 'pnl' ? 'P&L Analytics' : 'Engine Logs'}
                                </h2>
                                {activeTab === 'logs' && (
                                    <button
                                        onClick={() => setLogs([])}
                                        className="text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-widest"
                                    >
                                        Clear Logs
                                    </button>
                                )}
                            </div>

                            {activeTab === 'positions' ? (
                                testStrikes.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b border-slate-100 bg-slate-50/30">
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Symbol</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Side</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Strike</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Qty</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Avg Price</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">LTP</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">PnL</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Chart</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {testStrikes.map((leg, i) => (
                                                    <PositionRow key={leg.token || i} leg={leg} />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="p-20 text-center space-y-4">
                                        <div className="flex justify-center flex-col items-center gap-4 opacity-20">
                                            <Shield className="w-12 h-12 text-slate-400" />
                                            <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500">No active positions</span>
                                        </div>
                                    </div>
                                )
                            ) : activeTab === 'orders' ? (
                                orders.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b border-slate-100 bg-slate-50/30">
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Symbol</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Side</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Price</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Qty</th>
                                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {orders.map((order, i) => (
                                                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-mono text-xs text-slate-600">
                                                            {new Date(order.created_at).toLocaleTimeString('en-IN', { hour12: false })}
                                                        </td>
                                                        <td className="px-6 py-4 font-bold text-sm text-slate-900">{order.symbol}</td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${order.side === 'BUY' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                                                                {order.side}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-center font-mono text-sm text-slate-800">₹{order.price}</td>
                                                        <td className="px-6 py-4 text-center font-mono text-sm text-slate-600">{order.quantity}</td>
                                                        <td className="px-6 py-4 text-right">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${order.status === 'COMPLETE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-50 text-slate-700 border border-slate-100'}`}>
                                                                {order.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="p-20 text-center space-y-4">
                                        <div className="flex justify-center flex-col items-center gap-4 opacity-20">
                                            <Shield className="w-12 h-12 text-slate-400" />
                                            <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500">No orders placed today.</span>
                                        </div>
                                    </div>
                                )
                            ) : activeTab === 'alerts' ? (
                                alerts.length > 0 ? (
                                    <div className="overflow-y-auto max-h-[600px] p-4 space-y-3">
                                        {alerts.map((alert, i) => {
                                            const severityColors = {
                                                SUCCESS: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                                                ERROR: 'bg-rose-50 border-rose-200 text-rose-700',
                                                WARNING: 'bg-amber-50 border-amber-200 text-amber-700',
                                                INFO: 'bg-blue-50 border-blue-200 text-blue-700'
                                            };
                                            const colorClass = severityColors[alert.severity as keyof typeof severityColors] || severityColors.INFO;

                                            return (
                                                <div key={i} className={`border rounded-xl p-4 ${colorClass} transition-all hover:shadow-md`}>
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-2xl">{alert.icon}</span>
                                                        <div className="flex-1">
                                                            <div className="font-bold text-sm mb-1">{alert.title}</div>
                                                            <div className="text-xs opacity-80 whitespace-pre-line">{alert.message}</div>
                                                            <div className="text-[10px] font-mono mt-2 opacity-60">
                                                                {new Date(alert.created_at).toLocaleString('en-IN')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-20 text-center space-y-4">
                                        <div className="flex justify-center flex-col items-center gap-4 opacity-20">
                                            <Bell className="w-12 h-12 text-slate-400" />
                                            <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500">No alerts yet</span>
                                        </div>
                                    </div>
                                )
                            ) : activeTab === 'pnl' ? (
                                <div className="p-6 space-y-6">
                                    {/* Date Filter */}
                                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm font-bold text-slate-600">Date from:</label>
                                            <input
                                                type="date"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <span className="text-slate-400">-</span>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Summary Metrics */}
                                    <div className="grid grid-cols-4 gap-4">
                                        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-4">
                                            <div className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1">Realized P&L</div>
                                            <div className={`text-2xl font-bold ${pnlSummary.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {pnlSummary.totalPnl >= 0 ? '+' : ''}₹{(pnlSummary.totalPnl / 1000).toFixed(2)}k
                                            </div>
                                        </div>
                                        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-xl p-4">
                                            <div className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-1">Charges & taxes</div>
                                            <div className="text-2xl font-bold text-orange-600">
                                                ₹{pnlSummary.charges}
                                            </div>
                                        </div>
                                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4">
                                            <div className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-1">Other credits & debits</div>
                                            <div className="text-2xl font-bold text-purple-600">
                                                {pnlSummary.credits >= 0 ? '+' : ''}₹{pnlSummary.credits}
                                            </div>
                                        </div>
                                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
                                            <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">Net Realized P&L</div>
                                            <div className={`text-2xl font-bold ${pnlSummary.netPnl >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                                {pnlSummary.netPnl >= 0 ? '+' : ''}₹{(pnlSummary.netPnl / 1000).toFixed(2)}k
                                            </div>
                                        </div>
                                    </div>

                                    {/* Calendar */}
                                    <CalendarHeatmap
                                        data={dailyPnL}
                                        startDate={startDate}
                                        endDate={endDate}
                                        onDateClick={handleDateClick}
                                    />
                                </div>
                            ) : activeTab === 'logs' ? (
                                <div className="flex-1 overflow-y-auto p-6 space-y-2 font-mono scrollbar-thin scrollbar-thumb-slate-200 max-h-[600px]">
                                    {logs.length > 0 ? (
                                        logs.map((log, i) => {
                                            const logMsg = typeof log === 'object' && log !== null ? (log as any).msg || JSON.stringify(log) : String(log);
                                            const logTime = typeof log === 'object' && log !== null ? (log as any).time || new Date().toLocaleTimeString() : new Date().toLocaleTimeString();

                                            return (
                                                <div key={i} className="text-[11px] leading-relaxed animate-in slide-in-from-left-2 duration-300 py-1 border-b border-slate-50 last:border-0">
                                                    <span className="text-blue-500 font-bold mr-2">[{logTime}]</span>
                                                    <span className="text-slate-600">{logMsg}</span>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="py-20 flex items-center justify-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                                            No recent activity detected
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Sidebar: Workflow & Logs */}
                    <div className="lg:col-span-1 space-y-4">
                        <EngineWorkflow status={status} activity={engineActivity} />
                    </div>
                </div>
            </main>

            {/* Client Details Modal */}
            {showClientModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-300">
                        {/* Modal Header */}
                        <div className="bg-slate-900 p-8 flex justify-between items-center text-white relative">
                            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                                <Shield size={120} />
                            </div>
                            <div className="relative z-10">
                                <h2 className="text-2xl font-black tracking-tighter italic uppercase leading-tight">Account Intelligence</h2>
                                <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em] mt-1">Institutional Grade Trading Console</p>
                            </div>
                            <button onClick={() => setShowClientModal(false)} className="p-3 hover:bg-white/10 rounded-2xl transition-all relative z-10 active:scale-95">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-10 space-y-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {/* Personal & Broker Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3 border-b border-slate-100 pb-2">
                                        <div className="w-2 h-4 bg-blue-600 rounded-full" />
                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Identity & Broker</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Client ID</label>
                                            <p className="font-black text-slate-900 text-lg tabular-nums">{(clientDetails || userDetails)?.actid || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">User Name</label>
                                            <p className="font-black text-slate-900 text-lg uppercase">{(userDetails || clientDetails)?.uname || 'CLIENT'}</p>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Brokerage</label>
                                            <p className="font-black text-blue-600 text-lg italic">FINVASIA</p>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">PAN Card</label>
                                            <p className="font-black text-slate-900 text-lg uppercase">{userDetails?.pan || 'VERIFIED'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex items-center gap-3 border-b border-slate-100 pb-2">
                                        <div className="w-2 h-4 bg-emerald-500 rounded-full" />
                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Banking Interface</h3>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Bank Name</label>
                                            <p className="font-black text-slate-900 text-sm italic">{clientDetails?.bnk || 'HDFC BANK'}</p>
                                            <div className="mt-2 flex justify-between items-center">
                                                <div className="space-y-0.5">
                                                    <label className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">Account</label>
                                                    <p className="font-mono text-xs text-slate-600">****{clientDetails?.accno?.slice(-4) || '8842'}</p>
                                                </div>
                                                <div className="space-y-0.5 text-right">
                                                    <label className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">IFSC</label>
                                                    <p className="font-mono text-xs text-slate-600">{clientDetails?.ifsc || 'HDFC0000001'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Margins & Balances */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 border-b border-slate-100 pb-2">
                                    <div className="w-2 h-4 bg-amber-500 rounded-full" />
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Financial Liquidity</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-gradient-to-br from-blue-50 to-white p-5 rounded-2xl border border-blue-100/50 shadow-sm">
                                        <label className="text-[9px] font-bold text-blue-400 uppercase tracking-widest block mb-2">Cash Available</label>
                                        <p className="text-2xl font-black text-blue-700 tabular-nums">
                                            ₹{parseFloat(margins?.cash || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="bg-gradient-to-br from-emerald-50 to-white p-5 rounded-2xl border border-emerald-100/50 shadow-sm">
                                        <label className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block mb-2">Total Margin</label>
                                        <p className="text-2xl font-black text-emerald-700 tabular-nums">
                                            ₹{parseFloat(margins?.marginused || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="bg-gradient-to-br from-amber-50 to-white p-5 rounded-2xl border border-amber-100/50 shadow-sm">
                                        <label className="text-[9px] font-bold text-amber-500 uppercase tracking-widest block mb-2">Pay-in Today</label>
                                        <p className="text-2xl font-black text-amber-700 tabular-nums">
                                            ₹{parseFloat(margins?.payin || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Footer / Dismiss */}
                            <div className="pt-8 border-t border-slate-100 flex justify-between items-center">
                                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    Account Status: Secure & Synchronized
                                </div>
                                <button
                                    onClick={() => setShowClientModal(false)}
                                    className="px-10 py-4 bg-slate-900 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95 flex items-center gap-2"
                                >
                                    Dismiss Module
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Position Details Modal */}
            <PositionDetailsModal
                isOpen={showPositionModal}
                onClose={() => setShowPositionModal(false)}
                date={selectedDate}
                positions={selectedPositions}
                totalPnl={selectedPnL}
            />
        </div>
    );
};

export default Dashboard;
