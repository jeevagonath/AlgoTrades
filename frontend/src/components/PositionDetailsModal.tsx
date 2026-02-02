import React, { useEffect, useState } from 'react';
import { X, Loader2, Layers } from 'lucide-react';

interface Position {
    symbol: string;
    type: string;
    side: string;
    strike: number;
    entry_price: number;
    exit_price: number;
    quantity: number;
    pnl: number;
}

interface PositionDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: string;
    tradeIds?: string[];
}

export function PositionDetailsModal({ isOpen, onClose, date, tradeIds = [] }: PositionDetailsModalProps) {
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(0);

    // Reset tab when modal opens or date changes
    useEffect(() => {
        if (isOpen) {
            setActiveTab(0);
        }
    }, [isOpen, date]);

    useEffect(() => {
        if (isOpen && tradeIds.length > 0) {
            fetchTradeData(tradeIds[activeTab]);
        } else {
            setPositions([]);
        }
    }, [isOpen, tradeIds, activeTab]);

    const fetchTradeData = async (tradeId: string) => {
        setLoading(true);
        try {
            const API_URL = import.meta.env.VITE_API_BASE_URL || 'https://algotradesservice.onrender.com/api';
            const res = await fetch(`${API_URL}/analytics/trade-positions/${tradeId}`);
            const data = await res.json();

            if (data.status === 'success') {
                setPositions(data.data || []);
            } else {
                console.error('Failed to fetch positions:', data);
                setPositions([]);
            }
        } catch (err) {
            console.error('Error fetching trade positions:', err);
            setPositions([]);
        } finally {
            setLoading(false);
        }
    };

    const totalPnl = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border w-full max-w-4xl rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-hidden flex flex-col transition-colors">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border bg-background/50">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Position Details</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {new Date(date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 dark:text-slate-500 hover:text-foreground transition-colors p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                {tradeIds.length > 1 && (
                    <div className="px-6 pt-4 border-b border-border flex items-center gap-2 overflow-x-auto">
                        {tradeIds.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setActiveTab(idx)}
                                className={`
                                    px-4 py-2 text-sm font-bold rounded-t-lg transition-colors flex items-center gap-2
                                    ${activeTab === idx
                                        ? 'bg-background border-t border-x border-border text-foreground'
                                        : 'bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }
                                `}
                            >
                                <Layers className="w-3.5 h-3.5" />
                                Trade {idx + 1}
                            </button>
                        ))}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 relative min-h-[300px]">
                    {loading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    ) : positions.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-border bg-background/50">
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Symbol</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Type</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Side</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-right">Strike</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-right">Entry</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-right">Exit</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-right">Qty</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-right">P&L</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {positions.map((position, index) => (
                                        <tr key={index} className="border-b border-border/50 hover:bg-background/50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-medium text-foreground">{position.symbol}</td>
                                            <td className="px-4 py-3">
                                                <span className={`text-[10px] font-black px-2 py-1 rounded-md ${position.type === 'CE' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'}`}>
                                                    {position.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-[10px] font-black px-2 py-1 rounded-md ${position.side === 'BUY' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'}`}>
                                                    {position.side}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 text-right font-mono">₹{position.strike ? Number(position.strike).toFixed(0) : 'N/A'}</td>
                                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 text-right font-mono">₹{position.entry_price ? Number(position.entry_price).toFixed(2) : 'N/A'}</td>
                                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 text-right font-mono">₹{position.exit_price ? Number(position.exit_price).toFixed(2) : 'N/A'}</td>
                                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 text-right font-mono">{position.quantity || 0}</td>
                                            <td className={`px-4 py-3 text-sm font-bold text-right font-mono ${position.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                {position.pnl ? (position.pnl >= 0 ? '+' : '') + '₹' + Number(position.pnl).toFixed(2) : '₹0.00'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="py-20 text-center">
                            <p className="text-slate-400 text-sm">No positions found for this trade</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-border bg-background/50 transition-colors">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                            Total P&L {tradeIds.length > 1 ? `(Trade ${activeTab + 1})` : ''}
                        </span>
                        <span className={`text-2xl font-black font-mono ${totalPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
