import { useEffect, useState } from 'react';

interface DailyPnLData {
    date: string;
    pnl: number;
    tradeCount: number;
    tradeIds?: string[];
}

interface CalendarHeatmapProps {
    data: DailyPnLData[];
    startDate?: string;
    endDate?: string;
    onDateClick?: (date: string, tradeIds: string[], pnl: number) => void;
}

export function CalendarHeatmap({ data, startDate, endDate, onDateClick }: CalendarHeatmapProps) {
    const [months, setMonths] = useState<any[]>([]);

    useEffect(() => {
        console.log('CalendarHeatmap received data:', data);
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
                // Use local date string to avoid timezone issues
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayData = data.find(d => d.date === dateStr);

                const currentWeek = weeks[weeks.length - 1];
                currentWeek.push({
                    date: dateStr,
                    day,
                    pnl: dayData?.pnl || 0,
                    tradeCount: dayData?.tradeCount || 0,
                    tradeIds: dayData?.tradeIds || []
                });

                // Start new week on Sunday
                if (date.getDay() === 6 && day !== lastDay.getDate()) {
                    weeks.push([]);
                }
            }

            monthsData.push({ month: monthName, year, weeks });
            current.setMonth(current.getMonth() + 1);
        }

        // Reverse to show latest month first
        setMonths(monthsData.reverse());
    };

    const getPnLColor = (pnl: number, tradeCount: number) => {
        if (tradeCount === 0) return 'bg-slate-50 text-slate-300';

        // Profit colors (green scale)
        if (pnl > 0) {
            if (pnl >= 2000) return 'bg-green-600 text-white';
            if (pnl >= 1500) return 'bg-green-500 text-white';
            if (pnl >= 1000) return 'bg-green-400 text-white';
            if (pnl >= 500) return 'bg-green-300 text-green-900';
            return 'bg-green-200 text-green-900';
        }

        // Loss colors (red scale)
        if (pnl <= -2000) return 'bg-red-600 text-white';
        if (pnl <= -1500) return 'bg-red-500 text-white';
        if (pnl <= -1000) return 'bg-red-400 text-white';
        if (pnl <= -500) return 'bg-red-300 text-red-900';
        return 'bg-red-200 text-red-900';
    };

    const formatPnL = (pnl: number) => {
        return pnl >= 0 ? `+₹${pnl.toFixed(0)}` : `-₹${Math.abs(pnl).toFixed(0)}`;
    };

    return (
        <div className="space-y-4">
            {/* Legend */}
            <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">Daily P&L Calendar</h3>
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-red-500"></div>
                        <span className="text-slate-600">Loss</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-slate-100 border border-slate-200"></div>
                        <span className="text-slate-600">No Trade</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-green-500"></div>
                        <span className="text-slate-600">Profit</span>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {months.map((monthData, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="text-xs font-bold text-slate-700 mb-3 text-center">
                            {monthData.month} {monthData.year}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {/* Day headers */}
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                                <div key={i} className="text-[9px] font-bold text-slate-400 text-center pb-1">
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
                                                        text-[9px] font-bold border border-slate-200
                                                        transition-all hover:scale-110 hover:shadow-md hover:z-10
                                                        ${getPnLColor(cell.pnl, cell.tradeCount)}
                                                        ${cell.tradeCount > 0 ? 'cursor-pointer' : ''}
                                                    `}
                                                    title={cell.tradeCount > 0 ? `${cell.date}: ${formatPnL(cell.pnl)} (${cell.tradeCount} trade${cell.tradeCount > 1 ? 's' : ''})` : cell.date}
                                                    onClick={() => {
                                                        console.log('🖱️ Calendar cell clicked:', cell);
                                                        if (cell.tradeCount > 0 && onDateClick && cell.tradeIds) {
                                                            console.log('✅ Triggering onDateClick with:', cell.date, cell.tradeIds, cell.pnl);
                                                            onDateClick(cell.date, cell.tradeIds, cell.pnl);
                                                        } else {
                                                            console.log('❌ Click not triggered. tradeCount:', cell.tradeCount, 'onDateClick:', !!onDateClick, 'tradeIds:', cell.tradeIds);
                                                        }
                                                    }}
                                                >
                                                    {cell.day}
                                                </div>
                                                {/* Tooltip */}
                                                {cell.tradeCount > 0 && (
                                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[9px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-lg">
                                                        <div className="font-bold">{cell.date}</div>
                                                        <div className={cell.pnl >= 0 ? 'text-green-300' : 'text-red-300'}>{formatPnL(cell.pnl)}</div>
                                                        <div className="text-slate-300">{cell.tradeCount} trade{cell.tradeCount > 1 ? 's' : ''}</div>
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

            {/* Empty State */}
            {months.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                    <div className="text-slate-400 text-sm">No trade history available for the selected period</div>
                </div>
            )}
        </div>
    );
}

