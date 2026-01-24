import { useEffect, useState } from 'react';
import { Calendar, TrendingUp, TrendingDown, Target, Award } from 'lucide-react';
import { CalendarHeatmap } from '@/components/CalendarHeatmap';

interface PnLSummary {
    totalRealizedPnL: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    maxProfitDay: number;
    maxLossDay: number;
    avgProfit: number;
    avgLoss: number;
}

export default function PnL() {
    const [dailyPnL, setDailyPnL] = useState<any[]>([]);
    const [summary, setSummary] = useState<PnLSummary | null>(null);
    const [isVirtual, setIsVirtual] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 6);

        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
    }, []);

    useEffect(() => {
        if (startDate && endDate) {
            fetchData();
        }
    }, [startDate, endDate, isVirtual]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const API_URL = import.meta.env.VITE_API_BASE_URL || 'https://algotradesservice.onrender.com/api';

            // Fetch daily P&L
            const dailyRes = await fetch(
                `${API_URL}/analytics/daily-pnl?startDate=${startDate}&endDate=${endDate}&isVirtual=${isVirtual}`
            );
            const dailyData = await dailyRes.json();
            setDailyPnL(dailyData.data || []);

            // Fetch summary
            const summaryRes = await fetch(
                `${API_URL}/analytics/summary?startDate=${startDate}&endDate=${endDate}&isVirtual=${isVirtual}`
            );
            const summaryData = await summaryRes.json();
            setSummary(summaryData.data || null);
        } catch (err) {
            console.error('Failed to fetch P&L data:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value: number) => {
        const abs = Math.abs(value);
        if (abs >= 1000) {
            return `${value >= 0 ? '+' : '-'}₹${(abs / 1000).toFixed(2)}k`;
        }
        return `${value >= 0 ? '+' : ''}₹${value.toFixed(0)}`;
    };

    return (
        <div className="min-h-screen bg-background p-6 transition-colors duration-300">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-foreground">P&L Analytics</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Track your trading performance over time</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => window.history.back()}
                            className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-foreground transition-colors"
                        >
                            ← Back to Dashboard
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-card rounded-2xl p-6 border border-border shadow-sm transition-colors">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg text-sm text-foreground px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                            />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg text-sm text-foreground px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                            />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Mode</label>
                            <select
                                value={isVirtual ? 'virtual' : 'live'}
                                onChange={(e) => setIsVirtual(e.target.value === 'virtual')}
                                className="w-full bg-background border border-border rounded-lg text-sm text-foreground px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors appearance-none cursor-pointer"
                            >
                                <option value="virtual">Virtual Simulation</option>
                                <option value="live">Live Trading</option>
                            </select>
                        </div>
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="px-8 py-2 bg-slate-900 dark:bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-slate-800 dark:hover:bg-blue-700 transition-all shadow-lg dark:shadow-blue-900/20 active:scale-95 disabled:opacity-50"
                        >
                            {loading ? 'Refreshing...' : 'Analyze Data'}
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                {summary && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-card rounded-xl p-6 border border-border shadow-sm transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Realized P&L</span>
                                <TrendingUp className={`w-4 h-4 ${summary.totalRealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} />
                            </div>
                            <div className={`text-2xl font-black ${summary.totalRealizedPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {formatCurrency(summary.totalRealizedPnL)}
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 uppercase font-bold tracking-tighter">{summary.totalTrades} trades executed</div>
                        </div>

                        <div className="bg-card rounded-xl p-6 border border-border shadow-sm transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Efficiency Rate</span>
                                <Target className="w-4 h-4 text-blue-500" />
                            </div>
                            <div className="text-2xl font-black text-foreground">
                                {summary.winRate.toFixed(1)}%
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 uppercase font-bold tracking-tighter">
                                {summary.winningTrades}W / {summary.losingTrades}L Ratio
                            </div>
                        </div>

                        <div className="bg-card rounded-xl p-6 border border-border shadow-sm transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Peak Performance</span>
                                <Award className="w-4 h-4 text-emerald-500" />
                            </div>
                            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(summary.maxProfitDay)}
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 uppercase font-bold tracking-tighter">Best single session</div>
                        </div>

                        <div className="bg-card rounded-xl p-6 border border-border shadow-sm transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Drawdown Limit</span>
                                <TrendingDown className="w-4 h-4 text-rose-500" />
                            </div>
                            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                                {formatCurrency(summary.maxLossDay)}
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 uppercase font-bold tracking-tighter">Worst single session</div>
                        </div>
                    </div>
                )}

                {/* Calendar Heatmap */}
                <CalendarHeatmap data={dailyPnL} startDate={startDate} endDate={endDate} />
            </div>
        </div>
    );
}
