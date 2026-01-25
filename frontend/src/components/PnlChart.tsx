import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface PnlData {
    time: string;
    pnl: number;
}

interface PnlChartProps {
    data: PnlData[];
    className?: string;
}

export const PnlChart: React.FC<PnlChartProps> = ({ data, className }) => {
    // Determine min and max for Y-axis domain padding
    const minPnl = Math.min(...data.map(d => d.pnl), 0);
    const maxPnl = Math.max(...data.map(d => d.pnl), 0);
    const padding = Math.max(Math.abs(minPnl), Math.abs(maxPnl)) * 0.1; // 10% padding

    // Gradient ID for unique referencing
    const gradientId = "pnlGradient";

    return (
        <div className={`w-full h-full min-h-[300px] bg-card/50 rounded-xl p-4 border border-border ${className}`}>
            <h3 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Cumulative P&L</h3>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
                        <XAxis
                            dataKey="time"
                            stroke="#64748b"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={30}
                        />
                        <YAxis
                            stroke="#64748b"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `₹${value}`}
                            domain={[minPnl - padding, maxPnl + padding]}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1e293b',
                                borderColor: '#334155',
                                borderRadius: '8px',
                                color: '#f8fafc'
                            }}
                            itemStyle={{ color: '#10b981' }}
                            formatter={(value: number | undefined) => [`₹${(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'P&L']}
                            labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="pnl"
                            stroke="#10b981"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill={`url(#${gradientId})`}
                            animationDuration={500}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
