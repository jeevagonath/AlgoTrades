import { useEffect, useState } from 'react';
import {
    TrendingUp, TrendingDown, Target, Award,
    Receipt, Info, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { CalendarHeatmap } from '@/components/CalendarHeatmap';
import {
    calculateChargesForTrade,
    aggregateCharges,
    type ChargesBreakdown,
    CHARGE_RATES,
} from '@/utils/chargesCalculator';

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface TradeWithPositions {
    id: string;
    exit_time: string;
    pnl: number;
    is_virtual: boolean;
    position_history_log: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (value: number, showSign = true) => {
    const abs = Math.abs(value);
    const sign = showSign ? (value >= 0 ? '+' : '-') : value < 0 ? '-' : '';
    if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`;
    if (abs >= 1_000)   return `${sign}₹${(abs / 1_000).toFixed(2)}k`;
    return `${sign}₹${abs.toFixed(2)}`;
};

const fmtCharge = (v: number) => `₹${v.toFixed(2)}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ChargesRowProps {
    label: string;
    description: string;
    buy: number;
    sell: number;
    total: number;
    highlight?: boolean;
}

function ChargesRow({ label, description, buy, sell, total, highlight }: ChargesRowProps) {
    return (
        <tr className={`border-b border-border/50 transition-colors ${highlight
            ? 'bg-slate-100/80 dark:bg-slate-800/60 font-bold'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
        }`}>
            <td className="py-3 px-4">
                <div className={`text-sm ${highlight ? 'text-foreground font-bold' : 'text-foreground/90'}`}>{label}</div>
                {!highlight && <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{description}</div>}
            </td>
            <td className="py-3 px-4 text-right font-mono text-sm text-slate-600 dark:text-slate-400">
                {fmtCharge(buy)}
            </td>
            <td className="py-3 px-4 text-right font-mono text-sm text-slate-600 dark:text-slate-400">
                {fmtCharge(sell)}
            </td>
            <td className={`py-3 px-4 text-right font-mono text-sm ${highlight
                ? 'text-rose-600 dark:text-rose-400 text-base'
                : 'text-slate-700 dark:text-slate-300'
            }`}>
                {fmtCharge(total)}
            </td>
        </tr>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PnL() {
    const [dailyPnL, setDailyPnL]           = useState<any[]>([]);
    const [summary, setSummary]              = useState<PnLSummary | null>(null);
    const [tradeHistory, setTradeHistory]    = useState<TradeWithPositions[]>([]);
    const [charges, setCharges]              = useState<ChargesBreakdown | null>(null);
    const [isVirtual, setIsVirtual]          = useState(true);
    const [startDate, setStartDate]          = useState('');
    const [endDate, setEndDate]              = useState('');
    const [loading, setLoading]              = useState(false);
    const [showChargesDetail, setShowChargesDetail] = useState(false);

    // Initialise date range to last 6 months
    useEffect(() => {
        const end   = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 6);
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
    }, []);

    useEffect(() => {
        if (startDate && endDate) fetchData();
    }, [startDate, endDate, isVirtual]);

    // Recalculate charges whenever trade history changes
    useEffect(() => {
        const tradesWithPositions = tradeHistory.filter(
            t => t.position_history_log?.length > 0
        );
        if (tradesWithPositions.length === 0) {
            setCharges(null);
            return;
        }
        const breakdowns = tradesWithPositions.map(t =>
            calculateChargesForTrade(t.position_history_log)
        );
        setCharges(aggregateCharges(breakdowns));
    }, [tradeHistory]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const API_URL = import.meta.env.VITE_API_BASE_URL || 'https://algotradesservice.onrender.com/api';
            const params  = `startDate=${startDate}&endDate=${endDate}&isVirtual=${isVirtual}`;

            const [dailyRes, summaryRes, historyRes] = await Promise.all([
                fetch(`${API_URL}/analytics/daily-pnl?${params}`),
                fetch(`${API_URL}/analytics/summary?${params}`),
                fetch(`${API_URL}/analytics/trade-history?${params}`),
            ]);

            const [dailyData, summaryData, historyData] = await Promise.all([
                dailyRes.json(),
                summaryRes.json(),
                historyRes.json(),
            ]);

            setDailyPnL(dailyData.data || []);
            setSummary(summaryData.data || null);
            setTradeHistory(historyData.data || []);
        } catch (err) {
            console.error('Failed to fetch P&L data:', err);
        } finally {
            setLoading(false);
        }
    };

    const grossPnL  = summary?.totalRealizedPnL ?? 0;
    const totalCharges = charges?.total ?? 0;
    const netPnL    = grossPnL - totalCharges;

    return (
        <div className="min-h-screen bg-background p-6 transition-colors duration-300">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* ── Header ─────────────────────────────────────────── */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-foreground">P&L Analytics</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Track your trading performance — including all charges & taxes
                        </p>
                    </div>
                    <button
                        onClick={() => window.history.back()}
                        className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-foreground transition-colors"
                    >
                        ← Back to Dashboard
                    </button>
                </div>

                {/* ── Filters ────────────────────────────────────────── */}
                <div className="bg-card rounded-2xl p-6 border border-border shadow-sm transition-colors">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg text-sm text-foreground px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                            />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                                End Date
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg text-sm text-foreground px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                            />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                                Mode
                            </label>
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
                            {loading ? 'Refreshing…' : 'Analyze Data'}
                        </button>
                    </div>
                </div>

                {/* ── Summary Cards ──────────────────────────────────── */}
                {summary && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-card rounded-xl p-6 border border-border shadow-sm transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                    Net Realized P&L
                                </span>
                                <TrendingUp className={`w-4 h-4 ${netPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} />
                            </div>
                            {/* Main value — Net P&L (after charges) */}
                            <div className={`text-2xl font-black ${netPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {fmt(netPnL)}
                            </div>
                            {/* Secondary — Gross P&L */}
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-1.5">
                                <span className="uppercase font-bold tracking-tighter">Gross</span>
                                <span className={`font-semibold ${grossPnL >= 0 ? 'text-emerald-500/70 dark:text-emerald-400/60' : 'text-rose-500/70 dark:text-rose-400/60'}`}>
                                    {fmt(grossPnL)}
                                </span>
                                {charges && (
                                    <>
                                        <span className="text-slate-300 dark:text-slate-600">·</span>
                                        <span className="text-rose-400/80 dark:text-rose-500/70 font-semibold">
                                            -{fmtCharge(totalCharges)} charges
                                        </span>
                                    </>
                                )}
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 uppercase font-bold tracking-tighter">
                                {summary.totalTrades} trades executed
                            </div>
                        </div>

                        <div className="bg-card rounded-xl p-6 border border-border shadow-sm transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Efficiency Rate</span>
                                <Target className="w-4 h-4 text-blue-500" />
                            </div>
                            <div className="text-2xl font-black text-foreground">{summary.winRate.toFixed(1)}%</div>
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
                                {fmt(summary.maxProfitDay)}
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 uppercase font-bold tracking-tighter">Best single session</div>
                        </div>

                        <div className="bg-card rounded-xl p-6 border border-border shadow-sm transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Drawdown Limit</span>
                                <TrendingDown className="w-4 h-4 text-rose-500" />
                            </div>
                            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                                {fmt(summary.maxLossDay)}
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 uppercase font-bold tracking-tighter">Worst single session</div>
                        </div>
                    </div>
                )}

                {/* ── Calendar Heatmap ───────────────────────────────── */}
                <CalendarHeatmap data={dailyPnL} startDate={startDate} endDate={endDate} />

                {/* ── Charges & Taxes Section ────────────────────────── */}
                <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden transition-colors">

                    {/* Section Header */}
                    <div className="px-6 py-5 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-foreground">Charges &amp; Taxes</h2>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                    Finvasia · NSE F&amp;O Options · Estimated costs
                                </p>
                            </div>
                        </div>

                        {charges && (
                            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                                <Zap className="w-3.5 h-3.5" />
                                <span>{charges.tradesCounted} trade{charges.tradesCounted !== 1 ? 's' : ''} with position data</span>
                            </div>
                        )}
                    </div>

                    {charges ? (
                        <>
                            {/* ── Net P&L Summary Banner ─── */}
                            <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                                {/* Gross P&L */}
                                <div className="px-6 py-5">
                                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                                        Gross P&L
                                    </div>
                                    <div className={`text-2xl font-black ${grossPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {fmt(grossPnL)}
                                    </div>
                                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Before charges</div>
                                </div>

                                {/* Total Charges */}
                                <div className="px-6 py-5">
                                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                                        Total Charges
                                    </div>
                                    <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                                        -{fmtCharge(totalCharges)}
                                    </div>
                                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                        Turnover ₹{((charges.buySide.turnover + charges.sellSide.turnover) / 1000).toFixed(1)}k
                                    </div>
                                </div>

                                {/* Net P&L */}
                                <div className="px-6 py-5 bg-slate-50/60 dark:bg-slate-800/30">
                                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                                        Net P&L
                                    </div>
                                    <div className={`text-2xl font-black ${netPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {fmt(netPnL)}
                                    </div>
                                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">After all charges</div>
                                </div>
                            </div>

                            {/* ── Charge Percentage Pills ── */}
                            <div className="px-6 py-4 flex flex-wrap gap-3 border-b border-border/50 bg-slate-50/30 dark:bg-slate-800/10">
                                {[
                                    { label: 'Brokerage', value: charges.brokerage, color: 'blue' },
                                    { label: 'Exchange', value: charges.exchangeCharges, color: 'violet' },
                                    { label: 'GST', value: charges.gst, color: 'orange' },
                                    { label: 'SEBI Fee', value: charges.sebiFee, color: 'teal' },
                                    { label: 'Stamp Duty', value: charges.stampDuty, color: 'pink' },
                                    { label: 'STT', value: charges.stt, color: 'rose' },
                                ].map(({ label, value, color }) => {
                                    const pct = totalCharges > 0 ? (value / totalCharges) * 100 : 0;
                                    return (
                                        <div
                                            key={label}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold
                                                bg-${color}-50 dark:bg-${color}-900/20
                                                border-${color}-200 dark:border-${color}-800
                                                text-${color}-700 dark:text-${color}-300`}
                                        >
                                            <span>{label}</span>
                                            <span className="opacity-60">·</span>
                                            <span>{fmtCharge(value)}</span>
                                            <span className="opacity-50 text-[10px]">({pct.toFixed(1)}%)</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ── Toggle Detailed Breakdown ── */}
                            <button
                                onClick={() => setShowChargesDetail(v => !v)}
                                className="w-full px-6 py-3.5 flex items-center justify-between text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                            >
                                <span>Detailed Breakdown (Buy vs Sell)</span>
                                {showChargesDetail
                                    ? <ChevronUp className="w-4 h-4" />
                                    : <ChevronDown className="w-4 h-4" />
                                }
                            </button>

                            {/* ── Detailed Table ── */}
                            {showChargesDetail && (
                                <div className="overflow-x-auto border-t border-border/50">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-100/70 dark:bg-slate-800/50 border-b border-border">
                                                <th className="py-3 px-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 w-1/2">
                                                    Charge / Tax Component
                                                </th>
                                                <th className="py-3 px-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 text-right">
                                                    Buy Side
                                                    <div className="font-normal normal-case tracking-normal text-[10px] text-slate-400">
                                                        Turnover ₹{(charges.buySide.turnover / 1000).toFixed(1)}k
                                                    </div>
                                                </th>
                                                <th className="py-3 px-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 text-right">
                                                    Sell Side
                                                    <div className="font-normal normal-case tracking-normal text-[10px] text-slate-400">
                                                        Turnover ₹{(charges.sellSide.turnover / 1000).toFixed(1)}k
                                                    </div>
                                                </th>
                                                <th className="py-3 px-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 text-right">
                                                    Combined
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <ChargesRow
                                                label="Finvasia Brokerage"
                                                description={`₹${CHARGE_RATES.BROKERAGE_PER_ORDER} flat per executed order`}
                                                buy={charges.buySide.brokerage}
                                                sell={charges.sellSide.brokerage}
                                                total={charges.brokerage}
                                            />
                                            <ChargesRow
                                                label="Exchange Transaction Charges"
                                                description={`${(CHARGE_RATES.EXCHANGE * 100).toFixed(5)}% of premium turnover (NSE)`}
                                                buy={charges.buySide.exchangeCharges}
                                                sell={charges.sellSide.exchangeCharges}
                                                total={charges.exchangeCharges}
                                            />
                                            <ChargesRow
                                                label="GST (Goods & Services Tax)"
                                                description="18% on (Brokerage + Exchange Charges)"
                                                buy={charges.buySide.gst}
                                                sell={charges.sellSide.gst}
                                                total={charges.gst}
                                            />
                                            <ChargesRow
                                                label="SEBI Turnover Fee"
                                                description={`${(CHARGE_RATES.SEBI * 100).toFixed(4)}% (₹10 per crore) on turnover`}
                                                buy={charges.buySide.sebiFee}
                                                sell={charges.sellSide.sebiFee}
                                                total={charges.sebiFee}
                                            />
                                            <ChargesRow
                                                label="Stamp Duty"
                                                description={`${(CHARGE_RATES.STAMP_DUTY * 100).toFixed(3)}% on buy-side premium only`}
                                                buy={charges.buySide.stampDuty}
                                                sell={0}
                                                total={charges.stampDuty}
                                            />
                                            <ChargesRow
                                                label="STT (Securities Transaction Tax)"
                                                description={`${(CHARGE_RATES.STT * 100).toFixed(2)}% on sell-side premium only`}
                                                buy={0}
                                                sell={charges.sellSide.stt}
                                                total={charges.stt}
                                            />
                                            {/* Total row */}
                                            <ChargesRow
                                                label="Total Charges"
                                                description=""
                                                buy={charges.buySide.total}
                                                sell={charges.sellSide.total}
                                                total={charges.total}
                                                highlight
                                            />
                                        </tbody>
                                    </table>

                                    {/* Rate Reference Footer */}
                                    <div className="px-6 py-4 flex items-start gap-2 bg-blue-50/60 dark:bg-blue-900/10 border-t border-blue-100 dark:border-blue-900/30">
                                        <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                                        <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed">
                                            <strong>Rates:</strong> Brokerage ₹5/order · Exchange 0.03503% (NSE) · GST 18% on (Brokerage + Exchange) ·
                                            SEBI 0.0001% · Stamp Duty 0.003% (buy side) · STT 0.15% (sell side).
                                            Calculations are <strong>estimates</strong> based on recorded entry/exit prices in position_history_log.
                                            Actual exchange charges may vary slightly.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        /* No data state */
                        <div className="px-6 py-12 flex flex-col items-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <Receipt className="w-5 h-5 text-slate-400" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                                    {loading ? 'Calculating charges…' : 'No position data available'}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    Charges are calculated from position_history_log. Run some trades first.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
