import { useEffect, useState } from 'react';
import { Activity, ListOrdered, History, Bell, LogOut, TrendingUp, TrendingDown, Clock, Play, Search, Shield, Settings, Save, X } from 'lucide-react';
import { socketService } from '@/services/socket.service';
import { strategyApi } from '@/services/api.service';

const Dashboard = ({ onLogout }: { onLogout: () => void }) => {
    const [pnl, setPnl] = useState(0);
    const [peakProfit, setPeakProfit] = useState(0);
    const [peakLoss, setPeakLoss] = useState(0);
    const [testStrikes, setTestStrikes] = useState<any[]>([]);
    const [testing, setTesting] = useState(false);
    const [logs, setLogs] = useState<{ time: string, msg: string }[]>([]);
    const [orders, setOrders] = useState<any[]>([]); // New Order State


    const [expiries, setExpiries] = useState<string[]>([]);
    const [selectedExpiry, setSelectedExpiry] = useState<string>('');
    const [expiryApproved, setExpiryApproved] = useState(false);
    const [currentWeekExpiry, setCurrentWeekExpiry] = useState<string>('');
    const [nextWeekExpiry, setNextWeekExpiry] = useState<string>('');
    const [isExpiryDay, setIsExpiryDay] = useState(false);

    const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'alerts'>('positions');
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({
        entryTime: '12:59',
        exitTime: '15:15',
        targetPnl: 2100,
        stopLossPnl: -1500,
        telegramToken: '8494833053:AAHdVkSIgis5H-TcKnUi-LmOTJm67A8qILc',
        telegramChatId: '5177480141',
        isVirtual: true
    });
    const [manualExpiriesText, setManualExpiriesText] = useState('');
    const [niftyData, setNiftyData] = useState<{ price: number, change: number, changePercent: number, prevClose?: number } | null>(null);

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
                    setSettings({
                        entryTime: d.entryTime || '12:59',
                        exitTime: d.exitTime || '15:15',
                        targetPnl: d.targetPnl || 2100,
                        stopLossPnl: d.stopLossPnl || -1500,
                        telegramToken: d.telegramToken || '8494833053:AAHdVkSIgis5H-TcKnUi-LmOTJm67A8qILc',
                        telegramChatId: d.telegramChatId || '5177480141',
                        isVirtual: d.isVirtual !== undefined ? d.isVirtual : true
                    });
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

                // 5. Fetch Orders
                try {
                    const ordersRes = await strategyApi.getOrders();
                    if (ordersRes.status === 'success') {
                        setOrders(ordersRes.data);
                    }
                } catch (err) {
                    console.error('Failed to fetch orders:', err);
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

        socketService.on('strategy_exit', (data: any) => {
            addLog(`Strategy Exit: ${data.reason}`);
            setTestStrikes([]);
            setPnl(0);
        });

        return () => {
            // Cleanup socket listeners if needed
        };
    }, []);

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
        <div className="min-h-screen bg-[#05080f] text-slate-100 flex flex-col font-sans">
            {/* Background Glow */}
            <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[150px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600 rounded-full blur-[150px]" />
            </div>

            {/* Navigation */}
            <nav className="border-b border-slate-800 bg-slate-900/40 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600/20 rounded-lg border border-blue-500/30">
                            <Activity className="text-blue-500 w-6 h-6" />
                        </div>
                        <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                            NewAlgoTrades
                        </span>

                        {/* NIFTY 50 Ticker */}
                        {niftyData && (
                            <div className="hidden md:flex items-center gap-3 ml-6 animate-in slide-in-from-left-4 duration-500">
                                {/* Market Status Badge */}
                                {(() => {
                                    const now = new Date();
                                    const hours = now.getHours();
                                    const minutes = now.getMinutes();
                                    const currentTime = hours * 60 + minutes;
                                    const marketOpen = 9 * 60 + 15; // 09:15
                                    const marketClose = 15 * 60 + 30; // 15:30
                                    const isOpen = currentTime >= marketOpen && currentTime <= marketClose;

                                    return (
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${isOpen
                                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                            : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                            }`}>
                                            {isOpen ? 'Open' : 'Closed'}
                                        </div>
                                    );
                                })()}

                                {/* Price Card */}
                                {/* Price Card */}
                                <div className="flex items-center gap-3 px-0 py-0 text-white">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">NIFTY</span>
                                    <div className="w-px h-3 bg-slate-700" />
                                    <span className="text-base font-bold text-white font-mono tracking-tight">
                                        {niftyData.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>

                                    {/* Change Value (e.g. -37.95) */}
                                    <span className={`text-sm font-bold font-mono tracking-tight ${niftyData.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {niftyData.change > 0 ? '+' : ''}{niftyData.change.toFixed(2)}
                                    </span>

                                    {/* % Change Pill (e.g. -0.14%) */}
                                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${niftyData.change >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                        {niftyData.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                        <span className="text-[10px] font-bold">{Math.abs(niftyData.changePercent).toFixed(2)}%</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-8">
                        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
                            <button
                                onClick={() => setActiveTab('positions')}
                                className={`transition-colors uppercase tracking-widest text-[10px] font-black ${activeTab === 'positions' ? 'text-blue-400' : 'hover:text-white'}`}
                            >
                                Positions
                            </button>
                            <button
                                onClick={() => setActiveTab('orders')}
                                className={`transition-colors uppercase tracking-widest text-[10px] font-black ${activeTab === 'orders' ? 'text-blue-400' : 'hover:text-white'}`}
                            >
                                Orders
                            </button>
                            <button
                                onClick={() => setActiveTab('alerts')}
                                className={`transition-colors flex items-center gap-2 uppercase tracking-widest text-[10px] font-black ${activeTab === 'alerts' ? 'text-blue-400' : 'hover:text-white'}`}
                            >
                                <Bell className="w-3 h-3" />
                                Alerts
                            </button>
                        </div>
                        <div className="h-6 w-px bg-slate-800 hidden md:block" />
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`p-2 rounded-xl border transition-all ${showSettings ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white'}`}
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleLogout}
                            className="text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-2 text-[10px] font-black uppercase py-2 px-4 rounded-xl bg-rose-500/5 border border-rose-500/10 hover:border-rose-500/30 tracking-widest"
                        >
                            <LogOut className="w-3 h-3" />
                            Logout
                        </button>
                    </div>
                </div>
            </nav >

            {/* Settings Overlay */}
            {
                showSettings && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#05080f]/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl shadow-2xl p-8 space-y-8 animate-in zoom-in-95 duration-200">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold flex items-center gap-3">
                                    <Settings className="text-blue-500" />
                                    Strategy Settings
                                </h2>
                                <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Entry Time</label>
                                        <input
                                            type="time"
                                            value={settings.entryTime}
                                            onChange={e => setSettings({ ...settings, entryTime: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-blue-400 outline-none focus:border-blue-500 transition-colors"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Exit Time</label>
                                        <input
                                            type="time"
                                            value={settings.exitTime}
                                            onChange={e => setSettings({ ...settings, exitTime: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-blue-400 outline-none focus:border-blue-500 transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Target Profit (₹)</label>
                                    <input
                                        type="number"
                                        value={settings.targetPnl}
                                        onChange={e => setSettings({ ...settings, targetPnl: parseInt(e.target.value) })}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-emerald-400 outline-none focus:border-emerald-500 transition-colors"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Stop Loss (₹)</label>
                                    <input
                                        type="number"
                                        value={settings.stopLossPnl}
                                        onChange={e => setSettings({ ...settings, stopLossPnl: parseInt(e.target.value) })}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-rose-400 outline-none focus:border-rose-500 transition-colors"
                                    />
                                </div>

                                <div className="h-px bg-slate-800 my-2" />

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Trading Mode</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setSettings({ ...settings, isVirtual: true })}
                                            className={`py-3 px-4 rounded-xl font-bold text-sm transition-all ${settings.isVirtual
                                                ? 'bg-blue-600 text-white border-2 border-blue-500'
                                                : 'bg-slate-950 text-slate-400 border-2 border-slate-700 hover:border-slate-600'
                                                }`}
                                        >
                                            🧪 Virtual
                                        </button>
                                        <button
                                            onClick={() => setSettings({ ...settings, isVirtual: false })}
                                            className={`py-3 px-4 rounded-xl font-bold text-sm transition-all ${!settings.isVirtual
                                                ? 'bg-rose-600 text-white border-2 border-rose-500'
                                                : 'bg-slate-950 text-slate-400 border-2 border-slate-700 hover:border-slate-600'
                                                }`}
                                        >
                                            💰 Live
                                        </button>
                                    </div>
                                    {!settings.isVirtual && (
                                        <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                                            <p className="text-rose-400 text-xs font-bold">⚠️ WARNING: Live mode will place REAL orders with real money!</p>
                                        </div>
                                    )}
                                </div>

                                <div className="h-px bg-slate-800 my-2" />

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Telegram Bot Token</label>
                                        <input
                                            type="text"
                                            value={settings.telegramToken}
                                            onChange={e => setSettings({ ...settings, telegramToken: e.target.value })}
                                            placeholder="Enter Bot Token"
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs font-mono text-slate-300 outline-none focus:border-blue-500 transition-colors"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Telegram Chat ID</label>
                                        <input
                                            type="text"
                                            value={settings.telegramChatId}
                                            onChange={e => setSettings({ ...settings, telegramChatId: e.target.value })}
                                            placeholder="Enter Chat ID"
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs font-mono text-slate-300 outline-none focus:border-blue-500 transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="h-px bg-slate-800 my-2" />

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                        📅 Manual Expiry Dates
                                        <span className="text-[8px] font-normal text-rose-400">(Required)</span>
                                    </label>
                                    <textarea
                                        value={manualExpiriesText}
                                        onChange={e => setManualExpiriesText(e.target.value)}
                                        placeholder='{"expiryDates":["13-Jan-2026","20-Jan-2026","27-Jan-2026"]}'
                                        rows={4}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs font-mono text-slate-300 outline-none focus:border-blue-500 transition-colors resize-none"
                                    />
                                    <p className="text-[9px] text-slate-600 leading-relaxed">
                                        Paste NSE JSON or array. Format: {`{"expiryDates":["DD-Mon-YYYY",...]}`} or ["DD-MON-YYYY",...]
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={handleSaveSettings}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-blue-600/20"
                            >
                                <Save className="w-5 h-5" />
                                Save Configuration
                            </button>
                        </div>
                    </div>
                )
            }

            <main className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-6 relative z-10">
                {/* Header Action Row */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Strategy Dashboard</h1>
                        <p className="text-slate-400 text-xs font-medium">
                            Monitoring <span className="text-blue-400">Iron Condor</span> •
                            <span className={settings.isVirtual ? 'text-blue-400' : 'text-rose-400'}>
                                {settings.isVirtual ? 'Virtual' : 'LIVE'} Mode
                            </span>
                        </p>
                        {currentWeekExpiry && nextWeekExpiry && (
                            <div className="flex gap-4 mt-2 text-[10px] font-bold">
                                <div className={`flex items-center gap-2 bg-slate-800/50 border rounded-lg px-3 py-1 ${isExpiryDay ? 'border-rose-500 animate-pulse' : 'border-slate-700'}`}>
                                    <span className="text-slate-500">Current Week:</span>
                                    <span className={isExpiryDay ? 'text-rose-400' : 'text-blue-400'}>
                                        {currentWeekExpiry}
                                        {isExpiryDay && ' 🔔'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-800/50 border border-emerald-700 rounded-lg px-3 py-1">
                                    <span className="text-slate-500">Trading Week:</span>
                                    <span className="text-emerald-400">{nextWeekExpiry}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-4 items-center">
                        <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-1">
                            <span className="text-[10px] font-black uppercase text-slate-500">Expiry</span>
                            <select
                                value={selectedExpiry}
                                onChange={(e) => {
                                    setSelectedExpiry(e.target.value);
                                    setExpiryApproved(false);
                                    setTestStrikes([]);
                                }}
                                disabled={expiryApproved || testing}
                                className="bg-transparent text-xs font-bold text-blue-400 outline-none cursor-pointer"
                            >
                                {expiries.map(ex => (
                                    <option key={ex} value={ex} className="bg-slate-900">{ex}</option>
                                ))}
                            </select>
                            {!expiryApproved && (
                                <button
                                    onClick={() => {
                                        setExpiryApproved(true);
                                        addLog(`Expiry ${selectedExpiry} approved.`);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-500 text-[10px] font-black uppercase px-2 py-1 rounded-lg transition-colors ml-2"
                                >
                                    Approve
                                </button>
                            )}
                            {expiryApproved && (
                                <button
                                    onClick={() => setExpiryApproved(false)}
                                    className="text-slate-500 hover:text-rose-400 p-1"
                                >
                                    <LogOut className="w-3 h-3 rotate-180" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 space-y-2 group hover:border-blue-500/30 transition-colors">
                        <div className="flex items-center justify-between text-slate-400">
                            <span className="text-[10px] font-black uppercase tracking-widest">Total PnL</span>
                            <TrendingUp className={`w-4 h-4 ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} />
                        </div>
                        <div className={`text-3xl font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ₹{pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    {/* ... other metric cards ... */}
                    <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Peak Profit</div>
                        <div className="text-3xl font-black text-emerald-500/80">
                            ₹{peakProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Peak Loss</div>
                        <div className="text-3xl font-black text-rose-500/80">
                            ₹{peakLoss.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-blue-400" />
                            Next Expiry
                        </div>
                        <div className="text-3xl font-black text-blue-400">Thursday</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content Area */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl overflow-hidden">
                            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/30">
                                <h2 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                                    <ListOrdered className="w-4 h-4 text-blue-500" />
                                    Active Positions
                                </h2>
                                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] rounded-full font-black border border-blue-500/20 uppercase">
                                    {testStrikes.length > 0 ? 'Live - Virtual' : 'Standby'}
                                </span>
                            </div>

                            {activeTab === 'positions' ? (
                                testStrikes.length > 0 ? (
                                    <div className="divide-y divide-slate-800/50">
                                        <div className="grid grid-cols-5 p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800/50">
                                            <span className="col-span-1">Symbol</span>
                                            <span className="text-center">Side</span>
                                            <span className="text-center">Strike</span>
                                            <span className="text-center">Avg</span>
                                            <span className="text-right">LTP</span>
                                        </div>
                                        {testStrikes.map((leg, i) => (
                                            <div key={i} className="grid grid-cols-5 p-4 items-center hover:bg-white/5 transition-colors group">
                                                <div className="col-span-1">
                                                    <div className="font-bold text-sm text-slate-100">{leg.symbol}</div>
                                                    <div className="text-[10px] text-slate-500 font-bold uppercase">{leg.token}</div>
                                                </div>
                                                <div className="text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${leg.side === 'BUY' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                                                        {leg.side}
                                                    </span>
                                                </div>
                                                <div className="text-center font-mono text-sm text-slate-400">{leg.strike}</div>
                                                <div className="text-center font-mono text-sm text-slate-200">₹{leg.entryPrice || '0.00'}</div>
                                                <div className={`text-right font-mono text-sm font-bold group-hover:scale-105 transition-transform origin-right tracking-tight ${leg.ltp > leg.entryPrice ? (leg.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400') : (leg.side === 'BUY' ? 'text-rose-400' : 'text-emerald-400')}`}>
                                                    ₹{leg.ltp || '0.00'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-16 text-center text-slate-500 italic space-y-4">
                                        <div className="flex justify-center flex-col items-center gap-6 opacity-30">
                                            <Shield className="w-16 h-16 text-slate-700" />
                                            <span className="text-xs font-bold tracking-widest uppercase">No active positions. Execute strategy to begin.</span>
                                        </div>
                                    </div>
                                )
                            ) : activeTab === 'orders' ? (
                                orders.length > 0 ? (
                                    <div className="divide-y divide-slate-800/50">
                                        <div className="grid grid-cols-6 p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800/50">
                                            <span className="col-span-1">Time</span>
                                            <span className="col-span-1">Symbol</span>
                                            <span className="text-center">Side</span>
                                            <span className="text-center">Price</span>
                                            <span className="text-center">Qty</span>
                                            <span className="text-right">Status</span>
                                        </div>
                                        {orders.map((order, i) => (
                                            <div key={i} className="grid grid-cols-6 p-4 items-center hover:bg-white/5 transition-colors">
                                                <div className="col-span-1 font-mono text-xs text-slate-400">
                                                    {new Date(order.created_at).toLocaleTimeString('en-IN', { hour12: false })}
                                                </div>
                                                <div className="col-span-1 font-bold text-sm text-slate-100">{order.symbol}</div>
                                                <div className="text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${order.side === 'BUY' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                                                        {order.side}
                                                    </span>
                                                </div>
                                                <div className="text-center font-mono text-sm text-slate-200">₹{order.price}</div>
                                                <div className="text-center font-mono text-sm text-slate-400">{order.quantity}</div>
                                                <div className="text-right">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${order.status === 'COMPLETE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-700 text-slate-400'}`}>
                                                        {order.status}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-16 text-center text-slate-500 italic space-y-4">
                                        <div className="flex justify-center flex-col items-center gap-6 opacity-30">
                                            <ListOrdered className="w-16 h-16 text-slate-700" />
                                            <span className="text-xs font-bold tracking-widest uppercase">No orders placed today.</span>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="p-16 text-center text-slate-500 italic">
                                    <div className="text-xs font-bold tracking-widest uppercase opacity-30">Alerts Coming Soon...</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar Area */}
                    <div className="space-y-6">
                        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl h-[600px] flex flex-col shadow-2xl">
                            <div className="p-4 border-b border-slate-800 bg-slate-950/30">
                                <h2 className="font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                                    <History className="w-4 h-4 text-purple-500" />
                                    System Logs
                                </h2>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[10px]">
                                {logs.map((log, i) => (
                                    <div key={i} className="text-slate-400 flex gap-3 group">
                                        <span className="text-blue-500 font-bold shrink-0">[{log.time}]</span>
                                        <span className="leading-relaxed group-hover:text-slate-200 transition-colors">{log.msg}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div >
    );
};

export default Dashboard;
