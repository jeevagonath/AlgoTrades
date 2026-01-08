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
        <div className="min-h-screen bg-[#f8f9fc] bg-linear-to-br from-white to-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-[120px]" />

            <div className="w-full max-w-md space-y-8 relative z-10">
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center justify-center p-4 bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-2 overflow-hidden">
                        <img src="/logo.png" alt="AlgoTrades Logo" className="w-14 h-14 object-contain" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-linear-to-r from-slate-900 to-slate-600">
                            AlgoTrades
                        </h1>
                        <p className="text-slate-400 text-sm font-semibold uppercase tracking-widest">Trading Intelligence</p>
                    </div>
                </div>

                <div className="bg-white/80 backdrop-blur-xl border border-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] p-10 space-y-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-2xl text-sm font-bold text-center animate-in shake duration-500">
                                {error}
                            </div>
                        )}
                        <div className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Identity</label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        name="userid"
                                        type="text"
                                        required
                                        value={formData.userid}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 shadow-sm"
                                        placeholder="Broker User ID"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Authentication</label>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        name="password"
                                        type="password"
                                        required
                                        value={formData.password}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 shadow-sm"
                                        placeholder="Enter Password"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">2FA Code</label>
                                    <div className="relative group">
                                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                        <input
                                            name="twoFA"
                                            type="text"
                                            required
                                            value={formData.twoFA}
                                            onChange={handleChange}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 shadow-sm"
                                            placeholder="123456"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Vendor</label>
                                    <div className="relative group">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                        <input
                                            name="vendor_code"
                                            type="text"
                                            required
                                            value={formData.vendor_code}
                                            onChange={handleChange}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 shadow-sm"
                                            placeholder="Code"
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
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 shadow-sm"
                                    placeholder="Enter Broker API Secret"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Machine ID / IMEI</label>
                                <div className="relative group">
                                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        name="imei"
                                        type="text"
                                        required
                                        value={formData.imei}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-slate-900 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all placeholder:text-slate-300 shadow-sm"
                                        placeholder="e.g. ABC-123-XYZ"
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-5 rounded-2xl shadow-xl shadow-slate-900/10 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 group relative overflow-hidden"
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
                    </form>
                </div>

                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-1 bg-slate-200 rounded-full" />
                    <p className="text-center text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">
                        Military Grade Encryption • v1.0.6
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
