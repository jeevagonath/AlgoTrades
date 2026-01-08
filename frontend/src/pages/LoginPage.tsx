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
        <div className="min-h-screen bg-[#f8f9fc] flex items-center justify-center p-4 relative overflow-hidden">
            <div className="w-full max-w-md space-y-8 relative z-10">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl border border-slate-200 shadow-sm mb-4">
                        <Activity className="w-10 h-10 text-blue-600" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter text-slate-900">AlgoTrades</h1>
                    <p className="text-slate-500 font-medium">Initialize the trading engine</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white border border-slate-200 p-8 rounded-3xl shadow-sm space-y-6">
                    {error && (
                        <div className="bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-xl text-sm font-bold text-center">
                            {error}
                        </div>
                    )}
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">User ID</label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    name="userid"
                                    type="text"
                                    required
                                    value={formData.userid}
                                    onChange={handleChange}
                                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all placeholder:text-slate-300"
                                    placeholder="Broker User ID"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    name="password"
                                    type="password"
                                    required
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all placeholder:text-slate-300"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">2FA / TOTP</label>
                                <div className="relative group">
                                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        name="twoFA"
                                        type="text"
                                        required
                                        value={formData.twoFA}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all placeholder:text-slate-300"
                                        placeholder="123456"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Vendor Code</label>
                                <div className="relative group">
                                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        name="vendor_code"
                                        type="text"
                                        required
                                        value={formData.vendor_code}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all placeholder:text-slate-300"
                                        placeholder="VC Code"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">API Secret</label>
                            <input
                                name="api_secret"
                                type="text"
                                required
                                value={formData.api_secret}
                                onChange={handleChange}
                                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3.5 px-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all placeholder:text-slate-300"
                                placeholder="Broker API Secret"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Machine ID</label>
                            <div className="relative group">
                                <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    name="imei"
                                    type="text"
                                    required
                                    value={formData.imei}
                                    onChange={handleChange}
                                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all placeholder:text-slate-300"
                                    placeholder="e.g. ABC-123"
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-md shadow-blue-600/10 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 group"
                    >
                        {loading ? (
                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                Start Trading
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="flex flex-col items-center gap-2 opacity-40">
                    <div className="w-8 h-1 bg-slate-300 rounded-full" />
                    <p className="text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                        Protected by end-to-end encryption
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
