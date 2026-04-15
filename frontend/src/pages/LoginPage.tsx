import { useState, useEffect } from 'react';
import { Activity, Lock, Key, ShieldCheck, ArrowRight, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { authApi } from '@/services/api.service';

interface LoginPageProps {
    onLogin: (data: any) => void;
}

const SHOONYA_LOGIN_URL = 'https://trade.shoonya.com/OAuthlogin/inverstor-entry-level/login';

const LoginPage = ({ onLogin }: LoginPageProps) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [codeCopied, setCodeCopied] = useState(false);
    const [formData, setFormData] = useState({
        app_key: localStorage.getItem('shoonya_app_key') || '',
        secret_key: localStorage.getItem('shoonya_secret_key') || '',
        code: '',
    });

    // Step tracker: 1 = enter credentials, 2 = enter auth code
    const [step, setStep] = useState<1 | 2>(1);

    // Auto-detect code from URL on redirect
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlCode = urlParams.get('code');
        
        if (urlCode) {
            setFormData(prev => ({ ...prev, code: urlCode }));
            setStep(2);
            
            // Optionally clear the URL parameter so it doesn't stay there
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }
    }, []);

    const handleChange = (e: any) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleOpenShoonya = () => {
        if (!formData.app_key) {
            setError('Please enter your App Key (Client Id) first.');
            return;
        }
        setError(null);
        // Save keys persistently
        localStorage.setItem('shoonya_app_key', formData.app_key);
        localStorage.setItem('shoonya_secret_key', formData.secret_key);
        // Open Shoonya login page
        const baseAppKey = formData.app_key.endsWith('_U') ? formData.app_key.slice(0, -2) : formData.app_key;
        window.open(`${SHOONYA_LOGIN_URL}?api_key=${encodeURIComponent(baseAppKey)}_U&route_to=${encodeURIComponent(baseAppKey)}`, '_blank');
        setStep(2);
    };

    const handleExchangeToken = async (e: any) => {
        e.preventDefault();
        if (!formData.code.trim()) {
            setError('Please paste the authorization code from the Shoonya redirect URL.');
            return;
        }
        setLoading(true);
        setError(null);

        // Save keys persistently
        localStorage.setItem('shoonya_app_key', formData.app_key);
        localStorage.setItem('shoonya_secret_key', formData.secret_key);

        try {
            const res = await authApi.exchangeToken(
                formData.code.trim(),
                formData.app_key.trim(),
                formData.secret_key.trim()
            );
            if (res.status === 'success') {
                onLogin(res.data);
            } else {
                setError(res.message || 'Token exchange failed');
            }
        } catch (err: any) {
            const errorData = err.response?.data;
            setError(errorData?.message || 'Connection error — could not reach backend');
        } finally {
            setLoading(false);
        }
    };

    const handleCopyRedirectTip = async () => {
        await navigator.clipboard.writeText('https://api.shoonya.com/');
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-500">
            {/* Ambient glow blobs */}
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-[120px]" />

            <div className="w-full max-w-md space-y-8 relative z-10">
                {/* Logo + Title */}
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center justify-center p-4 bg-card rounded-3xl border border-border shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none mb-2 overflow-hidden transition-colors">
                        <img src="/logo.png" alt="AlgoTrades Logo" className="w-14 h-14 object-contain" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-linear-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
                            AlgoTrades
                        </h1>
                        <p className="text-slate-400 dark:text-slate-500 text-sm font-semibold uppercase tracking-widest transition-colors">Trading Intelligence</p>
                    </div>
                </div>

                {/* Card */}
                <div className="bg-card/80 dark:bg-card/90 backdrop-blur-xl border border-border rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:shadow-slate-950/20 p-10 space-y-8 transition-colors">

                    {/* Step indicator */}
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-black transition-all ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>1</div>
                        <div className={`flex-1 h-0.5 rounded-full transition-all ${step >= 2 ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-black transition-all ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>2</div>
                    </div>

                    {/* Error banner */}
                    {error && (
                        <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-2xl text-sm font-bold text-center">
                            {error}
                        </div>
                    )}

                    {/* ── STEP 1: App Key + Secret Key ── */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div className="space-y-1">
                                <h2 className="text-xl font-black text-foreground">Connect Shoonya</h2>
                                <p className="text-slate-400 text-xs font-semibold leading-relaxed">
                                    Enter your API credentials from the <span className="text-blue-500">Shoonya API Key</span> page, then click Continue to authenticate.
                                </p>
                            </div>

                            <div className="space-y-4">
                                {/* App Key */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">App Key (Client Id)</label>
                                    <div className="relative group">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                        <input
                                            id="app_key"
                                            name="app_key"
                                            type="text"
                                            required
                                            value={formData.app_key}
                                            onChange={handleChange}
                                            className="w-full bg-background dark:bg-slate-900/50 border border-border rounded-2xl py-4 pl-12 pr-4 text-foreground font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm font-mono text-sm"
                                            placeholder="Your Shoonya Client Id"
                                        />
                                    </div>
                                </div>

                                {/* Secret Key */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Secret Code</label>
                                    <div className="relative group">
                                        <Activity className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                        <input
                                            id="secret_key"
                                            name="secret_key"
                                            type="password"
                                            required
                                            value={formData.secret_key}
                                            onChange={handleChange}
                                            className="w-full bg-background dark:bg-slate-900/50 border border-border rounded-2xl py-4 pl-12 pr-4 text-foreground font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm"
                                            placeholder="Secret Code from API page"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleOpenShoonya}
                                className="w-full bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white font-bold py-5 rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-blue-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-linear-to-r from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className="relative z-10 flex items-center gap-2">
                                    Continue to Shoonya Login
                                    <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </span>
                            </button>

                            {/* Already have code? skip */}
                            <button
                                type="button"
                                onClick={() => { setError(null); setStep(2); }}
                                className="w-full text-slate-400 hover:text-blue-500 text-xs font-bold uppercase tracking-widest transition-colors py-1"
                            >
                                Already have a code? Skip →
                            </button>
                        </div>
                    )}

                    {/* ── STEP 2: Paste auth code ── */}
                    {step === 2 && (
                        <form onSubmit={handleExchangeToken} className="space-y-6">
                            <div className="space-y-1">
                                <h2 className="text-xl font-black text-foreground">Paste Auth Code</h2>
                                <p className="text-slate-400 text-xs font-semibold leading-relaxed">
                                    After logging in on Shoonya, copy the <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-lg text-blue-500">code=</code> value from the redirect URL and paste it below.
                                </p>
                            </div>

                            {/* Hint box */}
                            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 rounded-2xl p-4 space-y-2">
                                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">How to get the code</p>
                                <ol className="text-xs text-slate-500 dark:text-slate-400 font-medium space-y-1 list-decimal list-inside">
                                    <li>The Shoonya login page just opened in a new tab</li>
                                    <li>Enter your Shoonya credentials and approve</li>
                                    <li>You'll be redirected — copy the <strong>code</strong> from the URL</li>
                                    <li>Paste it in the field below</li>
                                </ol>
                            </div>

                            {/* Auth Code input */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Authorization Code</label>
                                <div className="relative group">
                                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        id="auth_code"
                                        name="code"
                                        type="text"
                                        required
                                        autoFocus
                                        value={formData.code}
                                        onChange={handleChange}
                                        className="w-full bg-background dark:bg-slate-900/50 border border-border rounded-2xl py-4 pl-12 pr-4 text-foreground font-mono text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm"
                                        placeholder="Paste code from redirect URL..."
                                    />
                                </div>
                            </div>

                            {/* If app_key is missing, show inline inputs */}
                            {(!formData.app_key || !formData.secret_key) && (
                                <div className="space-y-3 pt-1 border-t border-border">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">API Credentials</p>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">App Key (Client Id)</label>
                                        <div className="relative group">
                                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                            <input
                                                name="app_key"
                                                type="text"
                                                value={formData.app_key}
                                                onChange={handleChange}
                                                className="w-full bg-background dark:bg-slate-900/50 border border-border rounded-2xl py-3 pl-12 pr-4 text-foreground font-mono text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm"
                                                placeholder="Client Id"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Secret Code</label>
                                        <div className="relative group">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                            <input
                                                name="secret_key"
                                                type="password"
                                                value={formData.secret_key}
                                                onChange={handleChange}
                                                className="w-full bg-background dark:bg-slate-900/50 border border-border rounded-2xl py-3 pl-12 pr-4 text-foreground font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm"
                                                placeholder="Secret Code"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

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

                            {/* Back to step 1 */}
                            <button
                                type="button"
                                onClick={() => { setStep(1); setError(null); setFormData(f => ({ ...f, code: '' })); }}
                                className="w-full text-slate-400 hover:text-blue-500 text-xs font-bold uppercase tracking-widest transition-colors py-1"
                            >
                                ← Back
                            </button>
                        </form>
                    )}
                </div>

                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-1 bg-slate-200 rounded-full" />
                    <p className="text-center text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">
                        OAuth 2.0 Secure Flow • v2.0.0
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
