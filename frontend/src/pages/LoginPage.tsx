import { useState } from 'react';
import { Activity, Lock, User, Key, ShieldCheck, ArrowRight, Smartphone } from 'lucide-react';
import { authApi } from '@/services/api.service';

interface LoginPageProps {
    onLogin: (data: any) => void;
}

const LoginPage = ({ onLogin }: LoginPageProps) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        userid: localStorage.getItem('shoonya_userid') || '',
        password: '',
        twoFA: '',
        api_secret: localStorage.getItem('shoonya_api_secret') || '',
        vendor_code: localStorage.getItem('shoonya_vendor_code') || '',
        imei: localStorage.getItem('shoonya_imei') || ''
    });

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Save persistent fields
        localStorage.setItem('shoonya_userid', formData.userid);
        localStorage.setItem('shoonya_vendor_code', formData.vendor_code);
        localStorage.setItem('shoonya_api_secret', formData.api_secret);
        localStorage.setItem('shoonya_imei', formData.imei);

        try {
            const res = await authApi.login(formData);
            if (res.status === 'success') {
                onLogin(res.data);
            } else {
                setError(res.message || 'Login failed');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Connection error to backend');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: any) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    return (
        <div className="min-h-screen bg-[#05080f] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px]" />

            <div className="w-full max-w-md space-y-8 relative z-10">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20 mb-4">
                        <Activity className="w-10 h-10 text-blue-500" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Shoonya Algo Login</h1>
                    <p className="text-slate-400">Enter your broker credentials to start the engine</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl space-y-6">
                    {error && (
                        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl text-sm text-center">
                            {error}
                        </div>
                    )}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">User ID</label>
                            <div className="relative group">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    name="userid"
                                    type="text"
                                    required
                                    value={formData.userid}
                                    onChange={handleChange}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    placeholder="Enter User ID"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    name="password"
                                    type="password"
                                    required
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">2FA / TOTP</label>
                                <div className="relative group">
                                    <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        name="twoFA"
                                        type="text"
                                        required
                                        value={formData.twoFA}
                                        onChange={handleChange}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        placeholder="123456"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Vendor Code</label>
                                <div className="relative group">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        name="vendor_code"
                                        type="text"
                                        required
                                        value={formData.vendor_code}
                                        onChange={handleChange}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        placeholder="VC Code"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">API Secret</label>
                            <input
                                name="api_secret"
                                type="text"
                                required
                                value={formData.api_secret}
                                onChange={handleChange}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="Enter API Secret"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">IMEI / Machine ID</label>
                            <div className="relative group">
                                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    name="imei"
                                    type="text"
                                    required
                                    value={formData.imei}
                                    onChange={handleChange}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    placeholder="e.g. ABC-123"
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 group"
                    >
                        {loading ? (
                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                Initialize Engine
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <p className="text-center text-slate-500 text-sm">
                    Protected by end-to-end encryption. Your credentials are never stored as plain text.
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
