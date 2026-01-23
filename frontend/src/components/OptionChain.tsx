import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCcw, TrendingUp, TrendingDown, Clock, Search, ChevronDown, Activity } from 'lucide-react';
import { strategyApi } from '@/services/api.service';
import { socketService } from '@/services/socket.service';

interface OptionChainProps {
    onStrikeSelect?: (strike: string) => void;
}

interface OptionData {
    token: string;
    tsym: string;
    optt: 'CE' | 'PE';
    strike: string;
    ltp: number;
    bid: number;
    ask: number;
    qty: number;
}

interface OptionRow {
    strike: string;
    call?: OptionData;
    put?: OptionData;
}

export const OptionChain: React.FC<OptionChainProps> = () => {
    const [index, setIndex] = useState('NIFTY');
    const [expiries, setExpiries] = useState<string[]>([]);
    const [selectedExpiry, setSelectedExpiry] = useState('');
    const [spotPrice, setSpotPrice] = useState(0);
    const [lotSize, setLotSize] = useState(0);
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<OptionRow[]>([]);
    const [tokens, setTokens] = useState<string[]>([]);

    const indices = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];

    // Initial Fetch
    useEffect(() => {
        fetchExpiries();
        fetchSpot();
    }, [index]);

    const fetchExpiries = async () => {
        try {
            const res = await strategyApi.getExpiries();
            if (res.status === 'success') {
                setExpiries(res.data);
                if (res.data.length > 0 && !selectedExpiry) {
                    setSelectedExpiry(res.data[0]);
                }
            }
        } catch (err) {
            console.error('Failed to fetch expiries:', err);
        }
    };

    const fetchSpot = async () => {
        try {
            const res = await strategyApi.getNiftySpot(); // Backend currently returns NIFTY spot
            if (res.status === 'success') {
                setSpotPrice(res.data.price);
            }
        } catch (err) {
            console.error('Failed to fetch spot:', err);
        }
    };

    const fetchChain = async () => {
        if (!selectedExpiry || !spotPrice) return;
        setLoading(true);
        try {
            // LOT SIZES (Shoonya convention)
            const lotMap: Record<string, number> = {
                'NIFTY': 75, // Note: User image shows 65, might be custom or old? I'll use 75 default for NSE Nifty or stick to 65 if that's what user prefers. User image said 65.
                'BANKNIFTY': 15,
                'FINNIFTY': 25,
                'MIDCPNIFTY': 50
            };
            setLotSize(index === 'NIFTY' ? 65 : lotMap[index] || 1); // Using 65 for Nifty as per user screenshot

            const res = await strategyApi.getOptionChain(index, selectedExpiry, spotPrice, 30);
            if (res.status === 'success' && res.data) {
                processChainData(res.data);
            }
        } catch (err) {
            console.error('Failed to fetch option chain:', err);
        } finally {
            setLoading(false);
        }
    };

    const processChainData = (data: any[]) => {
        const strikeMap: Record<string, OptionRow> = {};
        const allTokens: string[] = [];

        data.forEach(item => {
            const strike = item.strprc;
            if (!strikeMap[strike]) {
                strikeMap[strike] = { strike };
            }

            const optionData: OptionData = {
                token: item.token || '',
                tsym: item.tsym || '',
                optt: item.optt || 'CE',
                strike: strike,
                ltp: parseFloat(item.lp || '0'),
                bid: parseFloat(item.bp1 || '0'),
                ask: parseFloat(item.sp1 || '0'),
                qty: parseInt(item.bq1 || '0'),
            };

            if (item.optt === 'CE') strikeMap[strike].call = optionData;
            else if (item.optt === 'PE') strikeMap[strike].put = optionData;

            if (item.token) allTokens.push(item.token);
        });

        const sortedRows = Object.values(strikeMap).sort((a, b) => parseFloat(a.strike) - parseFloat(b.strike));
        setRows(sortedRows);

        // Update WebSocket Subscriptions
        if (tokens.length > 0) {
            socketService.unsubscribe(tokens);
        }
        setTokens(allTokens);
        socketService.subscribe(allTokens);
    };

    useEffect(() => {
        if (selectedExpiry && spotPrice) {
            fetchChain();
        }
    }, [selectedExpiry, spotPrice, index]);

    // WebSocket Price Updates
    useEffect(() => {
        const handlePriceUpdate = (data: any) => {
            setRows(prev => prev.map(row => {
                let updated = false;
                const newRow = { ...row };
                if (row.call && row.call.token === data.token) {
                    newRow.call = {
                        ...row.call,
                        ltp: data.ltp || row.call.ltp,
                        bid: data.bp1 || row.call.bid,
                        ask: data.sp1 || row.call.ask,
                        qty: data.bq1 || row.call.qty
                    };
                    updated = true;
                }
                if (row.put && row.put.token === data.token) {
                    newRow.put = {
                        ...row.put,
                        ltp: data.ltp || row.put.ltp,
                        bid: data.bp1 || row.put.bid,
                        ask: data.sp1 || row.put.ask,
                        qty: data.bq1 || row.put.qty
                    };
                    updated = true;
                }
                return updated ? newRow : row;
            }));
        };

        socketService.on('price_update', handlePriceUpdate);
        return () => {
            socketService.off('price_update', handlePriceUpdate);
            // Don't unsubscribe on every render, only unmount
        };
    }, [tokens]);

    // Unsubscribe on Unmount
    useEffect(() => {
        return () => {
            if (tokens.length > 0) {
                socketService.unsubscribe(tokens);
            }
        };
    }, []);

    const isATM = (strike: string) => {
        const s = parseFloat(strike);
        const diff = Math.abs(s - spotPrice);
        const interval = index === 'BANKNIFTY' ? 100 : 50;
        return diff < (interval / 2);
    };

    return (
        <div className="flex flex-col h-full bg-[#f8f9fc] animate-in fade-in duration-500">
            {/* Header Control Panel */}
            <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between shadow-sm sticky top-0 z-30">
                <div className="flex items-center gap-8">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Option Chain</h2>
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mt-1"></div>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Spot</span>
                                <span className="text-xs font-bold text-slate-900 font-mono tracking-tight">{spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-100">
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Lot Size</span>
                                <span className="text-xs font-bold text-blue-700 font-mono tracking-tight">{lotSize}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Symbol</label>
                        <div className="relative group min-w-[140px]">
                            <select
                                value={index}
                                onChange={(e) => setIndex(e.target.value)}
                                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 cursor-pointer hover:border-blue-300 hover:bg-white transition-all focus:ring-4 focus:ring-blue-500/10 outline-none shadow-sm"
                            >
                                {indices.map(i => <option key={i} value={i}>{i}</option>)}
                            </select>
                            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-[calc(50%-0px)] pointer-events-none group-hover:text-blue-500 transition-colors" />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Expiry</label>
                        <div className="relative group min-w-[160px]">
                            <select
                                value={selectedExpiry}
                                onChange={(e) => setSelectedExpiry(e.target.value)}
                                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 cursor-pointer hover:border-blue-300 hover:bg-white transition-all focus:ring-4 focus:ring-blue-500/10 outline-none shadow-sm"
                            >
                                {expiries.map(e => <option key={e} value={e}>{e}</option>)}
                            </select>
                            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-[calc(50%-0px)] pointer-events-none group-hover:text-blue-500 transition-colors" />
                        </div>
                    </div>

                    <button
                        onClick={fetchChain}
                        disabled={loading}
                        className="mt-5 p-3 rounded-xl bg-slate-900 hover:bg-blue-600 text-white shadow-xl shadow-slate-900/10 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 group"
                        title="Refresh Data"
                    >
                        <RefreshCcw className={`w-5 h-5 transition-transform duration-500 group-hover:rotate-180 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col px-8 py-6">
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50 flex flex-col flex-1 overflow-hidden">

                    {/* Table Header Grid */}
                    <div className="bg-slate-50/80 border-b border-slate-200 grid grid-cols-[1fr_0.8fr_1fr_1.2fr_1.2fr_1.2fr_1fr_0.8fr_1fr] sticky top-0 z-20 backdrop-blur-md">
                        <div className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Bid</div>
                        <div className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</div>
                        <div className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ask</div>
                        <div className="px-4 py-4 text-[11px] font-black text-slate-600 uppercase tracking-widest text-center border-l border-slate-200/50">LTP (CALLS)</div>
                        <div className="px-4 py-4 text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] text-center bg-slate-900 text-white border-x border-slate-900 shadow-lg relative z-10">Strike</div>
                        <div className="px-4 py-4 text-[11px] font-black text-slate-600 uppercase tracking-widest text-center border-r border-slate-200/50">LTP (PUTS)</div>
                        <div className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Bid</div>
                        <div className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</div>
                        <div className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ask</div>
                    </div>

                    {/* Table Dynamic Scrollable Body */}
                    <div className="flex-1 overflow-y-auto option-chain-body custom-scrollbar relative">
                        {loading && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-50 flex items-center justify-center">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Updating Chain...</span>
                                </div>
                            </div>
                        )}

                        {rows.length === 0 && !loading && (
                            <div className="flex flex-col items-center justify-center py-32 text-slate-300">
                                <div className="p-8 rounded-full bg-slate-50 border border-dashed border-slate-200 mb-6">
                                    <Activity className="w-16 h-16 opacity-10" />
                                </div>
                                <p className="text-xs font-black uppercase tracking-[0.3em] opacity-40">Awaiting Market Data</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-2">Select an expiry to view the option chain</p>
                            </div>
                        )}

                        {rows.map((row) => {
                            const isAtmRow = isATM(row.strike);
                            const rowThemeClass = isAtmRow
                                ? 'bg-blue-50/50 hover:bg-blue-100/50'
                                : 'hover:bg-slate-50/80 transition-colors';

                            return (
                                <div key={row.strike} className={`grid grid-cols-[1fr_0.8fr_1fr_1.2fr_1.2fr_1.2fr_1fr_0.8fr_1fr] border-b border-slate-100 transition-all duration-300 ${rowThemeClass}`}>
                                    {/* Calls Side */}
                                    <div className="px-4 py-3.5 text-xs text-slate-400 text-center font-mono opacity-60">
                                        {row.call?.bid.toFixed(2) || '-'}
                                    </div>
                                    <div className="px-4 py-3.5 text-xs text-slate-400 text-center font-mono opacity-40">
                                        {row.call?.qty || '-'}
                                    </div>
                                    <div className="px-4 py-3.5 text-xs text-slate-400 text-center font-mono opacity-60">
                                        {row.call?.ask.toFixed(2) || '-'}
                                    </div>
                                    <div className={`px-4 py-3.5 text-sm font-black text-center font-mono border-l border-slate-50 ${row.call && row.call.ltp > row.call.bid ? 'text-emerald-600' : 'text-slate-900'}`}>
                                        {row.call?.ltp.toFixed(2) || '-'}
                                    </div>

                                    {/* Center Strike */}
                                    <div className={`px-4 py-3.5 text-sm font-black text-center font-mono shadow-sm relative z-10 transition-all duration-300 ${isAtmRow ? 'bg-slate-900 text-white scale-[1.05] rounded-sm ring-4 ring-blue-500/10' : 'bg-slate-100/50 text-slate-900 border-x border-slate-200/50'}`}>
                                        {row.strike}
                                        {isAtmRow && <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full blur-sm animate-pulse"></div>}
                                    </div>

                                    {/* Puts Side */}
                                    <div className={`px-4 py-3.5 text-sm font-black text-center font-mono border-r border-slate-50 ${row.put && row.put.ltp > row.put.bid ? 'text-emerald-600' : 'text-slate-900'}`}>
                                        {row.put?.ltp.toFixed(2) || '-'}
                                    </div>
                                    <div className="px-4 py-3.5 text-xs text-slate-400 text-center font-mono opacity-60">
                                        {row.put?.bid.toFixed(2) || '-'}
                                    </div>
                                    <div className="px-4 py-3.5 text-xs text-slate-400 text-center font-mono opacity-40">
                                        {row.put?.qty || '-'}
                                    </div>
                                    <div className="px-4 py-3.5 text-xs text-slate-400 text-center font-mono opacity-60">
                                        {row.put?.ask.toFixed(2) || '-'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer Info */}
                <div className="mt-4 flex items-center justify-between opacity-50">
                    <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Live Updates Connected</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest">AlgoTrades Pro v2.0</span>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.05);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 0, 0, 0.1);
                }
                .option-chain-body {
                    scrollbar-gutter: stable;
                }
            `}} />
        </div>
    );
};
