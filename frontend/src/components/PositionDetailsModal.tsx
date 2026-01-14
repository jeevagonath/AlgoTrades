import React from 'react';
import { X } from 'lucide-react';

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
    positions: Position[];
    totalPnl: number;
}

export function PositionDetailsModal({ isOpen, onClose, date, positions, totalPnl }: PositionDetailsModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Position Details</h2>
                        <p className="text-sm text-slate-500 mt-1">{new Date(date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-100 rounded-lg"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {positions.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50">
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Symbol</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Type</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Side</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Strike</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Entry</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Exit</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Qty</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">P&L</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {positions.map((position, index) => (
                                        <tr key={index} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-medium text-slate-900">{position.symbol}</td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs font-bold px-2 py-1 rounded ${position.type === 'CE' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                    {position.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs font-bold px-2 py-1 rounded ${position.side === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {position.side}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-700 text-right font-mono">₹{position.strike?.toFixed(0)}</td>
                                            <td className="px-4 py-3 text-sm text-slate-700 text-right font-mono">₹{position.entry_price?.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-sm text-slate-700 text-right font-mono">₹{position.exit_price?.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-sm text-slate-700 text-right font-mono">{position.quantity}</td>
                                            <td className={`px-4 py-3 text-sm font-bold text-right font-mono ${position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {position.pnl >= 0 ? '+' : ''}₹{position.pnl?.toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="py-20 text-center">
                            <p className="text-slate-400 text-sm">No positions found for this date</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">Total P&L</span>
                        <span className={`text-2xl font-bold font-mono ${totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
