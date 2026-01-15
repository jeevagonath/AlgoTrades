import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import LoginPage from './pages/LoginPage'
import APITester from './pages/APITester'
import { authApi } from './services/api.service'
import { useEffect } from 'react'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'api'>('dashboard');

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await authApi.getSession();
        if (res.status === 'success' && res.data.authenticated) {
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error('Session check failed:', err);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  const handleLogin = (data: any) => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout API failed:', err);
    } finally {
      // Clear any local storage or session data regardless of API success
      localStorage.clear();
      sessionStorage.clear();
      setIsAuthenticated(false);
      setCurrentPage('dashboard');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fc] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Initializing AlgoTrades</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="relative">
      {/* Navigation Tabs */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 flex items-center gap-4 h-14">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-white border border-slate-100 rounded-lg shadow-sm overflow-hidden">
              <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900">AlgoTrades</span>
          </div>
          <div className="flex-1 flex items-center gap-2">
            <button
              onClick={() => setCurrentPage('dashboard')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${currentPage === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setCurrentPage('api')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${currentPage === 'api'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              API Tester
            </button>
          </div>
        </div>
      </div>

      {/* Page Content */}
      <div className="pt-14">
        {currentPage === 'dashboard' ? (
          <Dashboard onLogout={handleLogout} />
        ) : (
          <APITester />
        )}
      </div>
    </div>
  );
}

export default App
