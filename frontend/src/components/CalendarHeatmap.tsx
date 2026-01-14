import { useEffect, useState } from 'react';

interface DailyPnLData {
    date: string;
    pnl: number;
    tradeCount: number;
}

interface CalendarHeatmapProps {
    data: DailyPnLData[];
    startDate?: string;
    endDate?: string;
}

export function CalendarHeatmap({ data, startDate, endDate }: CalendarHeatmapProps) {
    const [months, setMonths] = useState<any[]>([]);

    useEffect(() => {
        generateCalendar();
    }, [data, startDate, endDate]);

    const generateCalendar = () => {
        const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
        const end = endDate ? new Date(endDate) : new Date();

        const monthsData: any[] = [];
        let current = new Date(start);

        while (current <= end) {
            const month = current.getMonth();
            const year = current.getFullYear();
            const monthName = current.toLocaleDateString('en-US', { month: 'short' });

            const weeks: any[][] = [[]];
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);

            // Add empty cells for days before month starts
            const startDayOfWeek = firstDay.getDay();
            for (let i = 0; i < startDayOfWeek; i++) {
                weeks[0].push(null);
            }

            // Add all days of the month
            for (let day = 1; day <= lastDay.getDate(); day++) {
                const date = new Date(year, month, day);
                const dateStr = date.toISOString().split('T')[0];
                const dayData = data.find(d => d.date === dateStr);

                const currentWeek = weeks[weeks.length - 1];
                currentWeek.push({
                    date: dateStr,
                    day,
                    pnl: dayData?.pnl || 0,
                    tradeCount: dayData?.tradeCount || 0
                });

                // Start new week on Sunday
                if (date.getDay() === 6 && day !== lastDay.getDate()) {
                    weeks.push([]);
                }
            }

            monthsData.push({ month: monthName, year, weeks });
            current.setMonth(current.getMonth() + 1);
        }

        setMonths(monthsData);
    };

    const getPnLColor = (pnl: number) => {
        if (pnl === 0) return 'bg-slate-100';

        // Profit colors (green scale)
        if (pnl > 0) {
            if (pnl >= 2000) return 'bg-green-600';
            if (pnl >= 1500) return 'bg-green-500';
            if (pnl >= 1000) return 'bg-green-400';
            if (pnl >= 500) return 'bg-green-300';
            return 'bg-green-200';
        }

        // Loss colors (red scale)
        if (pnl <= -2000) return 'bg-red-600';
        if (pnl <= -1500) return 'bg-red-500';
        if (pnl <= -1000) return 'bg-red-400';
        if (pnl <= -500) return 'bg-red-300';
        return 'bg-red-200';
    };

    const formatPnL = (pnl: number) => {
        return pnl >= 0 ? `+₹${pnl.toFixed(0)}` : `-₹${Math.abs(pnl).toFixed(0)}`;
    };

    return (
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">Daily P&L Calendar</h3>
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-red-500"></div>
                        <span className="text-slate-600">Max Loss</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-slate-100"></div>
                        <span className="text-slate-600">No Trade</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-green-500"></div>
                        <span className="text-slate-600">Max Profit</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {months.map((monthData, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-lg p-4">
                        <div className="text-sm font-bold text-slate-700 mb-3">
                            {monthData.month} {monthData.year}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {/* Day headers */}
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                                <div key={i} className="text-[10px] font-semibold text-slate-500 text-center pb-1">
                                    {day}
                                </div>
                            ))}

                            {/* Calendar cells */}
                            {monthData.weeks.map((week: any[], weekIdx: number) =>
                                week.map((cell: any, cellIdx: number) => (
                                    <div
                                        key={`${weekIdx}-${cellIdx}`}
                                        className="relative group"
                                    >
                                        {cell ? (
                                            <>
                                                <div
                                                    className={`
                                                        aspect-square rounded flex items-center justify-center
                                                        text-[10px] font-medium cursor-pointer
                                                        transition-all hover:scale-110 hover:shadow-md
                                                        ${getPnLColor(cell.pnl)}
                                                        ${cell.pnl > 0 ? 'text-green-900' : cell.pnl < 0 ? 'text-red-900' : 'text-slate-400'}
                                                    `}
                                                >
                                                    {cell.day}
                                                </div>
                                                {/* Tooltip */}
                                                {cell.tradeCount > 0 && (
                                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                                        {cell.date}<br />
                                                        {formatPnL(cell.pnl)}<br />
                                                        {cell.tradeCount} trade{cell.tradeCount > 1 ? 's' : ''}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="aspect-square"></div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
