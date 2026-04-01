import { useState } from 'react';
import { Activity, Key, ArrowRight, ExternalLink, ClipboardPaste, ChevronRight, CheckCircle2 } from 'lucide-react';
import { authApi } from '@/services/api.service';

interface LoginPageProps {
    onLogin: (data: any) => void;
}

// Shoonya OAuth login URL pattern — opens browser for user to authenticate
const SHOONYA_LOGIN_BASE = 'https://trade.shoonya.com';

const LoginPage = ({ onLogin }: LoginPageProps) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [appKey, setAppKey] = useState(localStorage.getItem('shoonya_app_key') || '');
    const [secretKey, setSecretKey] = useState(localStorage.getItem('shoonya_secret_key') || '');
    const [code, setCode] = useState('');

    const handleOpenShoonya = () => {
        if (!appKey || !secretKey) {
            setError('Enter your Client Id and Secret Code first.');
            return;
        }
        setError(null);
        localStorage.setItem('shoonya_app_key', appKey);
        localStorage.setItem('shoonya_secret_key', secretKey);
        // Open Shoonya login page — user will get a code after successful login
        window.open(`${SHOONYA_LOGIN_BASE}?app_key=${encodeURIComponent(appKey)}`, '_blank');
        setStep(2);
    };

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        if (!code.trim()) {
            setError('Paste the code from the Shoonya redirect URL.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await authApi.exchangeToken(code.trim(), appKey, secretKey);
            if (res.status === 'success') {
                onLogin(res.data);
            } else {
                setError(res.message || 'Token exchange failed');
            }
        } catch (err: any) {
            const errorData = err.response?.data;
            setError(errorData?.message || 'Connection error to backend');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background bg-linear-to-br from-background to-slate-100 dark:to-slate-900 flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-500">
            {/* Decorative background */}
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-[120px]" />

            <div className="w-full max-w-md space-y-8 relative z-10">
                {/* Logo */}
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center justify-center p-4 bg-card rounded-3xl border border-border shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none mb-2 overflow-hidden transition-colors">
                        <img src="/logo.png" alt="AlgoTrades Logo" className="w-14 h-14 object-contain" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-linear-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
                            AlgoTrades
                        </h1>
                        <p className="text-slate-400 dark:text-slate-500 text-sm font-semibold uppercase tracking-widest">Trading Intelligence</p>
                    </div>
                </div>

                {/* Step Progress */}
                <div className="flex items-center justify-center gap-3">
                    {[1, 2].map((s) => (
                        <div key={s} className="flex items-center gap-3">
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-all duration-300 ${
                                step > s
                                    ? 'bg-emerald-500 text-white'
                                    : step === s
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            }`}>
                                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
                            </div>
                            <span className={`text-xs font-bold uppercase tracking-widest ${step === s ? 'text-foreground' : 'text-slate-400'}`}>
                                {s === 1 ? 'Credentials' : 'Authenticate'}
                            </span>
                            {s < 2 && <ChevronRight className="w-4 h-4 text-slate-300" />}
                        </div>
                    ))}
                </div>

                {/* Card */}
                <div className="bg-card/80 dark:bg-card/90 backdrop-blur-xl border border-border rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:shadow-slate-950/20 p-10 space-y-8 transition-colors">

                    {error && (
                        <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-2xl text-sm font-bold text-center">
                            {error}
                        </div>
                    )}

                    {/* STEP 1 */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <h2 className="text-xl font-bold text-foreground">API Credentials</h2>
                                <p className="text-sm text-slate-400">Enter your Shoonya Client Id and Secret Code from the API Key Generation page.</p>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Client Id (App Key)</label>
                                    <div className="relative group">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                        <input
                                            type="text"
                                            required
                                            value={appKey}
                                            onChange={e => setAppKey(e.target.value)}
                                            className="w-full bg-background dark:bg-slate-900/50 border border-border rounded-2xl py-4 pl-12 pr-4 text-foreground font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm"
                                            placeholder="e.g. FA22136_U"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Secret Code</label>
                                    <div className="relative group">
                                        <Activity className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                        <input
                                            type="password"
                                            required
                                            value={secretKey}
                                            onChange={e => setSecretKey(e.target.value)}
                                            className="w-full bg-background dark:bg-slate-900/50 border border-border rounded-2xl py-4 pl-12 pr-4 text-foreground font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm"
                                            placeholder="Enter Secret Code"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleOpenShoonya}
                                className="w-full bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white font-bold py-5 rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-blue-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-linear-to-r from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className="relative z-10 flex items-center gap-2">
                                    Open Shoonya Login
                                    <ExternalLink className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                </span>
                            </button>

                            <button
                                onClick={() => { setError(null); setStep(2); }}
                                className="w-full text-slate-400 text-sm font-semibold py-2 hover:text-foreground transition-colors"
                            >
                                Already have a code? Skip to Step 2 →
                            </button>
                        </div>
                    )}

                    {/* STEP 2 */}
                    {step === 2 && (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <h2 className="text-xl font-bold text-foreground">Paste Auth Code</h2>
                                <p className="text-sm text-slate-400">
                                    After logging in to Shoonya, copy the <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md text-xs font-mono">code</code> value from the redirect URL and paste it below.
                                </p>
                            </div>

                            {/* URL format hint */}
                            <div className="bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Redirect URL format</p>
                                <p className="text-xs font-mono text-slate-500 break-all">
                                    https://yourapp.com/login?<span className="text-blue-500 font-bold">code=xxxxxxxx-xxxx-...</span>
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Auth Code</label>
                                <div className="relative group">
                                    <ClipboardPaste className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        type="text"
                                        required
                                        value={code}
                                        onChange={e => setCode(e.target.value)}
                                        className="w-full bg-background dark:bg-slate-900/50 border border-border rounded-2xl py-4 pl-12 pr-4 text-foreground font-mono text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm"
                                        placeholder="c61de38b-7c0c-46e4-8abe-..."
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white font-bold py-5 rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 group relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-linear-to-r from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                {loading ? (
                                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <span className="relative z-10 flex items-center gap-2">
                                        Unlock Trading Engine
                                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => { setError(null); setStep(1); }}
                                className="w-full text-slate-400 text-sm font-semibold py-2 hover:text-foreground transition-colors"
                            >
                                ← Back to Credentials
                            </button>
                        </form>
                    )}
                </div>

                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-1 bg-slate-200 rounded-full" />
                    <p className="text-center text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">
                        Military Grade Encryption • v1.0.7
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
