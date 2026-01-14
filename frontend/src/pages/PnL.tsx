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
        // Set default date range (last 6 months)
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
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900">P&L Analytics</h1>
                        <p className="text-sm text-slate-600 mt-1">Track your trading performance over time</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => window.history.back()}
                            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                        >
                            ← Back to Dashboard
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-700 mb-2">START DATE</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-700 mb-2">END DATE</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-700 mb-2">MODE</label>
                            <select
                                value={isVirtual ? 'virtual' : 'live'}
                                onChange={(e) => setIsVirtual(e.target.value === 'virtual')}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="virtual">Virtual</option>
                                <option value="live">Live</option>
                            </select>
                        </div>
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Loading...' : 'Apply'}
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                {summary && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl p-6 border border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-600">REALIZED P&L</span>
                                <TrendingUp className={`w-4 h-4 ${summary.totalRealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                            </div>
                            <div className={`text-2xl font-black ${summary.totalRealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(summary.totalRealizedPnL)}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">{summary.totalTrades} trades</div>
                        </div>

                        <div className="bg-white rounded-xl p-6 border border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-600">WIN RATE</span>
                                <Target className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="text-2xl font-black text-slate-900">
                                {summary.winRate.toFixed(1)}%
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                {summary.winningTrades}W / {summary.losingTrades}L
                            </div>
                        </div>

                        <div className="bg-white rounded-xl p-6 border border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-600">MAX PROFIT DAY</span>
                                <Award className="w-4 h-4 text-green-600" />
                            </div>
                            <div className="text-2xl font-black text-green-600">
                                {formatCurrency(summary.maxProfitDay)}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Best single day</div>
                        </div>

                        <div className="bg-white rounded-xl p-6 border border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-600">MAX LOSS DAY</span>
                                <TrendingDown className="w-4 h-4 text-red-600" />
                            </div>
                            <div className="text-2xl font-black text-red-600">
                                {formatCurrency(summary.maxLossDay)}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Worst single day</div>
                        </div>
                    </div>
                )}

                {/* Calendar Heatmap */}
                <CalendarHeatmap data={dailyPnL} startDate={startDate} endDate={endDate} />
            </div>
        </div>
    );
}
