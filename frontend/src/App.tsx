import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import LoginPage from './pages/LoginPage'
import APITester from './pages/APITester'
import { authApi } from './services/api.service'
import { Code } from 'lucide-react'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAPITester, setShowAPITester] = useState(false);

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
      localStorage.clear();
      sessionStorage.clear();
      setIsAuthenticated(false);
      setShowAPITester(false);
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

  // Show API Tester if requested
  if (showAPITester) {
    return (
      <div className="min-h-screen bg-[#f8f9fc]">
        {/* Simple back button */}
        <div className="bg-white border-b border-slate-200 px-6 py-3">
          <button
            onClick={() => setShowAPITester(false)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>
        <APITester />
      </div>
    );
  }

  // Show Dashboard with API Tester button
  return (
    <>
      {/* Floating API Tester Button */}
      <button
        onClick={() => setShowAPITester(true)}
        className="fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-2xl transition-all active:scale-95 flex items-center gap-2 group"
        title="Open API Tester"
      >
        <Code className="w-5 h-5" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 whitespace-nowrap font-semibold text-sm">
          API Tester
        </span>
      </button>
      <Dashboard onLogout={handleLogout} />
    </>
  );
}

export default App
