import React, { useState } from 'react';
import { ArrowLeft, Book, Server, Shield, Activity, Database, Key, Play, Copy, Check } from 'lucide-react';

interface Endpoint {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    description: string;
    category: 'Auth' | 'Strategy' | 'Analytics' | 'System';
    sampleBody?: object;
    isTestable?: boolean;
}

const endpoints: Endpoint[] = [
    // Auth
    {
        method: 'POST',
        path: '/api/auth/login',
        description: 'Authenticate user with Shoonya credentials.',
        category: 'Auth',
        sampleBody: { "uid": "USER123", "pwd": "PASSWORD", "factor2": "DOB_OR_PAN", "vc": "VENDOR_CODE", "appkey": "API_KEY", "imei": "MAC_ADDRESS" },
        isTestable: true
    },
    { method: 'POST', path: '/api/auth/logout', description: 'Logout current session.', category: 'Auth', isTestable: true },
    { method: 'GET', path: '/api/auth/session', description: 'Check if session is active.', category: 'Auth', isTestable: true },
    { method: 'GET', path: '/api/auth/user', description: 'Get user details.', category: 'Auth', isTestable: true },
    { method: 'GET', path: '/api/auth/client', description: 'Get client details.', category: 'Auth', isTestable: true },
    { method: 'GET', path: '/api/auth/margins', description: 'Get account margin limits.', category: 'Auth', isTestable: true },

    // Strategy
    { method: 'GET', path: '/api/strategy/state', description: 'Get current strategy engine state.', category: 'Strategy', isTestable: true },
    { method: 'POST', path: '/api/strategy/place-order', description: 'Manually trigger order placement.', category: 'Strategy', isTestable: true },
    { method: 'POST', path: '/api/strategy/exit', description: 'Manually exit all positions.', category: 'Strategy', isTestable: true },
    { method: 'POST', path: '/api/strategy/pause', description: 'Pause the strategy engine.', category: 'Strategy', isTestable: true },
    { method: 'POST', path: '/api/strategy/resume', description: 'Resume the strategy engine.', category: 'Strategy', isTestable: true },
    { method: 'POST', path: '/api/strategy/reset', description: 'Reset engine state to IDLE.', category: 'Strategy', isTestable: true },
    { method: 'GET', path: '/api/strategy/expiries', description: 'Get available expiry dates.', category: 'Strategy', isTestable: true },
    {
        method: 'GET',
        path: '/api/strategy/indices',
        description: 'Get indices list.',
        category: 'Strategy',
        isTestable: true
    },
    {
        method: 'GET',
        path: '/api/strategy/option-chain',
        description: 'Get option chain data.',
        category: 'Strategy',
        isTestable: false // Requires query params
    },
    { method: 'GET', path: '/api/strategy/nifty-spot', description: 'Get NIFTY spot price.', category: 'Strategy', isTestable: true },
    { method: 'GET', path: '/api/strategy/vix-spot', description: 'Get INDIA VIX spot price.', category: 'Strategy', isTestable: true },
    { method: 'GET', path: '/api/strategy/orders', description: 'Get order book (Live or Virtual).', category: 'Strategy', isTestable: true },
    { method: 'GET', path: '/api/strategy/logs', description: 'Get system logs.', category: 'Strategy', isTestable: true },
    { method: 'GET', path: '/api/strategy/manual-expiries', description: 'Get manually set expiry dates.', category: 'Strategy', isTestable: true },
    {
        method: 'POST',
        path: '/api/strategy/manual-expiries',
        description: 'Set manual expiry dates.',
        category: 'Strategy',
        sampleBody: { "expiries": ["12-FEB-2026", "19-FEB-2026"] },
        isTestable: true
    },
    {
        method: 'POST',
        path: '/api/strategy/test-selection',
        description: 'Test strike selection algorithm.',
        category: 'Strategy',
        sampleBody: { "expiry": "12-FEB-2026" },
        isTestable: true
    },
    {
        method: 'POST',
        path: '/api/strategy/mock-expiry',
        description: 'Set mock date for testing.',
        category: 'Strategy',
        sampleBody: { "date": "2026-02-12" },
        isTestable: true
    },
    {
        method: 'POST',
        path: '/api/strategy/activity',
        description: 'Set engine activity status.',
        category: 'Strategy',
        sampleBody: { "activity": "Scanning for signals..." },
        isTestable: true
    },
    {
        method: 'POST',
        path: '/api/strategy/status',
        description: 'Set engine operational status.',
        category: 'Strategy',
        sampleBody: { "status": "ACTIVE" },
        isTestable: true
    },
    {
        method: 'POST',
        path: '/api/strategy/test/place-order',
        description: 'Test order placement logic (Dry Run).',
        category: 'Strategy',
        isTestable: true
    },
    {
        method: 'POST',
        path: '/api/strategy/test/exit-order',
        description: 'Test order exit logic (Dry Run).',
        category: 'Strategy',
        isTestable: true
    },

    // Analytics
    { method: 'GET', path: '/api/analytics/summary', description: 'Get PnL summary metrics.', category: 'Analytics', isTestable: true },
    { method: 'GET', path: '/api/analytics/daily-pnl', description: 'Get daily PnL history for heatmap.', category: 'Analytics', isTestable: true },
    { method: 'GET', path: '/api/analytics/trade-history', description: 'Get detailed trade history.', category: 'Analytics', isTestable: true },
    { method: 'GET', path: '/api/analytics/intraday-pnl', description: 'Get intraday PnL snapshots.', category: 'Analytics', isTestable: true },

    // System
    {
        method: 'POST',
        path: '/api/proxy',
        description: 'Proxy requests to Shoonya API.',
        category: 'System',
        sampleBody: { "url": "https://api.shoonya.com/NorenWClientTP/SearchScrip", "data": { "uid": "USER_ID", "stext": "NIFTY" } },
        isTestable: true
    },
];

export default function ApiDocs({ onBack }: { onBack: () => void }) {
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    const categories = ['All', 'Auth', 'Strategy', 'Analytics', 'System'];
    const filteredEndpoints = selectedCategory === 'All'
        ? endpoints
        : endpoints.filter(e => e.category === selectedCategory);

    const getMethodColor = (method: string) => {
        switch (method) {
            case 'GET': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400';
            case 'POST': return 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400';
            case 'PUT': return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';
            case 'DELETE': return 'text-rose-600 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400';
            default: return 'text-slate-600 bg-slate-100';
        }
    };

    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Book className="w-6 h-6 text-blue-600" />
                                API Documentation
                            </h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                Reference guide for AlgoTrades Backend Endpoints
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedCategory === cat
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Endpoints Grid */}
                <div className="grid gap-4">
                    {filteredEndpoints.map((endpoint, i) => (
                        <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 transition-all hover:shadow-md group">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <span className={`px-2.5 py-1 rounded text-xs font-bold font-mono ${getMethodColor(endpoint.method)}`}>
                                            {endpoint.method}
                                        </span>
                                        <div className="space-y-1">
                                            <code className="text-sm font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                                {endpoint.path}
                                            </code>
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                {endpoint.description}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 self-start md:self-center">
                                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-medium text-slate-500 dark:text-slate-400">
                                            {endpoint.category}
                                        </span>
                                        {endpoint.isTestable && (
                                            <button
                                                className="p-1.5 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                                                title="Test Endpoint"
                                            >
                                                <Play className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Sample Body */}
                                {endpoint.sampleBody && (
                                    <div className="relative group/code">
                                        <div className="absolute right-2 top-2 opacity-0 group-hover/code:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleCopy(JSON.stringify(endpoint.sampleBody, null, 2), i)}
                                                className="p-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-colors"
                                                title="Copy JSON"
                                            >
                                                {copiedIndex === i ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                            </button>
                                        </div>
                                        <div className="bg-slate-950 rounded-lg p-3 font-mono text-xs overflow-x-auto text-slate-300">
                                            <div className="text-slate-500 mb-1 select-none">Sample Request Body:</div>
                                            <pre>{JSON.stringify(endpoint.sampleBody, null, 2)}</pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {filteredEndpoints.length === 0 && (
                    <div className="text-center py-20 opacity-50">
                        <Server className="w-12 h-12 mx-auto mb-4" />
                        <p>No endpoints found for this category.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
