
import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, BarChart3, Activity } from 'lucide-react';
import { useAnimatedValue, useFlashOnChange } from '@/hooks/useAnimations';
import { openTradingViewChart } from '@/utils/tradingview';
import { socketService } from '@/services/socket.service';
import { strategyApi } from '@/services/api.service';

interface MarketData {
    price: number;
    change: number;
    changePercent: number;
    prevClose?: number;
}

const TickerItem = ({ label, data, icon: Icon, onChartClick, chartSymbol }: { label: string, data: MarketData, icon?: any, onChartClick?: () => void, chartSymbol?: string }) => {
    const { displayValue: animatedPrice } = useAnimatedValue(data.price, 300);
    const isFlashing = useFlashOnChange(data.price);

    return (
        <div className={`flex items-center justify-between gap-2 transition-all duration-300 py-0.5 ${isFlashing ? 'flash-neutral' : ''}`}>
            <div className="flex flex-col">
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    {Icon && <Icon className="w-2.5 h-2.5" />}
                    {label}
                </span>
                <span className="text-lg font-black text-foreground font-mono tracking-tighter transition-all duration-300">
                    {animatedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
            </div>

            <div className="flex flex-col items-end">
                <span className={`text-[9px] font-bold font-mono transition-colors duration-300 ${data.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {data.change > 0 ? '+' : ''}{data.change.toFixed(2)}
                </span>
                <div className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[8px] font-bold mt-0.5 transition-colors duration-300 ${data.change >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'}`}>
                    {data.change >= 0 ? <TrendingUp className="w-2 h-2" /> : <TrendingDown className="w-2 h-2" />}
                    {Math.abs(data.changePercent).toFixed(2)}%
                </div>
            </div>
        </div>
    );
};

export const IndicesWidget = () => {
    const [niftyData, setNiftyData] = useState<MarketData | null>(null);
    const [vixData, setVixData] = useState<MarketData | null>(null);

    useEffect(() => {
        // Initial Fetch
        const fetchData = async () => {
            try {
                const [niftyRes, vixRes] = await Promise.all([
                    strategyApi.getNiftySpot(),
                    fetch(strategyApi.BASE_URL + '/strategy/vix-spot').then(res => res.json())
                ]);

                if (niftyRes.status === 'success' && niftyRes.data) setNiftyData(niftyRes.data);
                if (vixRes.status === 'success' && vixRes.data) setVixData(vixRes.data);

                // Subscribe to sockets
                socketService.subscribe(['26000', '26017']);

            } catch (err) {
                console.error('Failed to fetch indices data:', err);
            }
        };

        fetchData();

        const handlePriceUpdate = (data: any) => {
            const updateState = (prev: MarketData | null, data: any) => {
                if (!data.lp) return prev;
                const price = parseFloat(data.lp);
                const prevClose = prev?.prevClose || (price / (1 + (parseFloat(data.pc || '0') / 100)));

                const change = price - prevClose;
                const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

                return {
                    price,
                    change,
                    changePercent,
                    prevClose
                };
            };

            if (data.token === '26000') {
                setNiftyData(prev => updateState(prev, data));
            } else if (data.token === '26017') {
                setVixData(prev => updateState(prev, data));
            }
        };

        socketService.on('price_update', handlePriceUpdate);
        return () => {
            socketService.off('price_update', handlePriceUpdate);
        };
    }, []);

    return (
        <div className="bg-card border border-border rounded-xl p-3 shadow-sm overflow-hidden flex flex-col divide-y divide-border h-full justify-center">
            <div className="pb-2">
                {niftyData ? (
                    <TickerItem
                        label="NIFTY 50"
                        data={niftyData}
                        onChartClick={() => openTradingViewChart('NSE:NIFTY')}
                    />
                ) : (
                    <div className="h-12 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-md"></div>
                )}
            </div>

            <div className="pt-2">
                {vixData ? (
                    <TickerItem
                        label="INDIA VIX"
                        data={vixData}
                        icon={Activity}
                        onChartClick={() => openTradingViewChart('NSE:INDIAVIX')}
                    />
                ) : (
                    <div className="h-12 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-md"></div>
                )}
            </div>
        </div>
    );
};
