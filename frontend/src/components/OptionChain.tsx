import React, { useEffect, useState, useMemo, useRef } from 'react';
import { RefreshCcw, TrendingUp, TrendingDown, Clock, Search, ChevronDown, Activity, Info } from 'lucide-react';
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
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const scrolledRef = useRef(false);

    const indices = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];

    // Initial Fetch
    useEffect(() => {
        scrolledRef.current = false;
        fetchExpiries();
        fetchSpot();
    }, [index]);

    const fetchExpiries = async () => {
        try {
            const res = await strategyApi.getExpiries();
            if (res.status === 'success') {
                setExpiries(res.data);
                if (res.data.length > 0 && !selectedExpiry) {
                    // Default to second expiry if available, otherwise first
                    setSelectedExpiry(res.data[1] || res.data[0]);
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

    const fetchChain = async (refreshSpot = false) => {
        if (!selectedExpiry) return;

        if (refreshSpot || !spotPrice) {
            await fetchSpot();
        }

        if (!spotPrice && !refreshSpot) return;

        setLoading(true);
        try {
            // LOT SIZES (Shoonya convention)
            const lotMap: Record<string, number> = {
                'NIFTY': 75,
                'BANKNIFTY': 15,
                'FINNIFTY': 25,
                'MIDCPNIFTY': 50
            };
            setLotSize(index === 'NIFTY' ? 65 : lotMap[index] || 1);

            const currentSpot = spotPrice || 0;
            const res = await strategyApi.getOptionChain(index, selectedExpiry, currentSpot, 30);
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
            scrolledRef.current = false;
            fetchChain();
        }
    }, [selectedExpiry, spotPrice, index]);

    // Auto-scroll to ATM
    useEffect(() => {
        if (rows.length > 0 && !loading && !scrolledRef.current) {
            setTimeout(() => {
                const atmElement = document.getElementById('atm-row');
                if (atmElement && scrollContainerRef.current) {
                    const container = scrollContainerRef.current;
                    const scrollPos = atmElement.offsetTop - (container.clientHeight / 2) + (atmElement.clientHeight / 2);
                    container.scrollTo({ top: scrollPos, behavior: 'auto' });
                    scrolledRef.current = true;
                }
            }, 150);
        }
    }, [rows, loading]);

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
            {/* Compact Header Control Panel */}
            <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-end gap-5 shadow-sm sticky top-0 z-30">

                {/* Spot & Lot - Now part of the row */}
                <div className="flex items-center gap-3 mr-auto">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Spot</span>
                        <span className="text-xs font-bold text-slate-900 font-mono">{spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 border border-blue-100">
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Lot</span>
                        <span className="text-xs font-bold text-blue-700 font-mono">{lotSize}</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Symbol</label>
                        <div className="relative group min-w-[120px]">
                            <select
                                value={index}
                                onChange={(e) => setIndex(e.target.value)}
                                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 cursor-pointer hover:border-blue-300 hover:bg-white transition-all outline-none"
                            >
                                {indices.map(i => <option key={i} value={i}>{i}</option>)}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Expiry</label>
                        <div className="relative group min-w-[130px]">
                            <select
                                value={selectedExpiry}
                                onChange={(e) => setSelectedExpiry(e.target.value)}
                                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 cursor-pointer hover:border-blue-300 hover:bg-white transition-all outline-none"
                            >
                                {expiries.map(e => <option key={e} value={e}>{e}</option>)}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>

                    <button
                        onClick={() => fetchChain(true)}
                        disabled={loading}
                        className="p-2 rounded-lg bg-slate-900 hover:bg-blue-600 text-white shadow-lg active:scale-95 transition-all disabled:opacity-50"
                        title="Refresh Spot & Chain"
                    >
                        <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col px-6 py-4">
                <div className="bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/50 flex flex-col flex-1 overflow-hidden">

                    {/* Table Header Grid */}
                    <div className="bg-slate-50 border-b border-slate-200 grid grid-cols-[1fr_1fr_1fr] sticky top-0 z-20">
                        <div className="px-4 py-2.5 text-[10px] font-black text-slate-600 uppercase tracking-widest text-center border-r border-slate-100">LTP (CALLS)</div>
                        <div className="px-4 py-2.5 text-[10px] font-black text-white uppercase tracking-[0.2em] text-center bg-slate-900 relative z-10">Strike</div>
                        <div className="px-4 py-2.5 text-[10px] font-black text-slate-600 uppercase tracking-widest text-center border-l border-slate-100">LTP (PUTS)</div>
                    </div>

                    {/* Table Dynamic Scrollable Body */}
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto option-chain-body custom-scrollbar relative">
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
                            const strikeVal = parseFloat(row.strike);

                            // Highlighting Logic (Matching Sample Images)
                            // Calls OTM: Strike > Spot
                            // Puts OTM: Strike < Spot
                            const isCallOTM = strikeVal > spotPrice;
                            const isPutOTM = strikeVal < spotPrice;

                            return (
                                <div
                                    key={row.strike}
                                    id={isAtmRow ? 'atm-row' : undefined}
                                    className={`grid grid-cols-[1fr_1fr_1fr] border-b border-slate-100 transition-all duration-300 ${isAtmRow ? 'bg-blue-50/50' : 'hover:bg-slate-50/50'}`}
                                >
                                    {/* Calls LTP */}
                                    <div className={`px-4 py-2 text-[11px] font-bold text-center font-mono border-r border-slate-50 ${isCallOTM ? 'bg-amber-50/40 text-slate-400' : 'bg-white text-emerald-600'}`}>
                                        {row.call?.ltp.toFixed(2) || '-'}
                                    </div>

                                    {/* Center Strike */}
                                    <div className={`px-4 py-2 text-[11px] font-black text-center font-mono shadow-sm relative z-10 transition-all duration-300 ${isAtmRow ? 'bg-slate-900 text-white scale-[1.02] shadow-xl z-20' : 'bg-slate-100/30 text-slate-900 border-x border-slate-100'}`}>
                                        {row.strike}
                                    </div>

                                    {/* Puts LTP */}
                                    <div className={`px-4 py-2 text-[11px] font-bold text-center font-mono border-l border-slate-50 ${isPutOTM ? 'bg-amber-50/40 text-slate-400' : 'bg-white text-emerald-600'}`}>
                                        {row.put?.ltp.toFixed(2) || '-'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer Info */}
                    <div className="mt-4 flex items-center justify-between opacity-50 px-4 pb-4">
                        <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Live Updates Connected</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest">AlgoTrades Pro v2.0</span>
                    </div>
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
