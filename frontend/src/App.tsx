import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import LoginPage from './pages/LoginPage'
import APITester from './pages/APITester'
import ApiDocs from './pages/ApiDocs'
import { authApi } from './services/api.service'
import { Code } from 'lucide-react'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAPITester, setShowAPITester] = useState(false);

  const [showApiDocs, setShowApiDocs] = useState(false);

  useEffect(() => {
    // ... existing useEffect
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
      setShowApiDocs(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-border border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest animate-pulse transition-colors">Initializing AlgoTrades</p>
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
      <div className="min-h-screen bg-background">
        <div className="bg-card border-b border-border px-6 py-3 transition-colors">
          <button
            onClick={() => setShowAPITester(false)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>
        <APITester />
      </div>
    );
  }

  // Show API Docs if requested
  if (showApiDocs) {
    return <ApiDocs onBack={() => setShowApiDocs(false)} />;
  }

  // Show Dashboard with API Tester button
  return (
    <>
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
      <Dashboard onLogout={handleLogout} onShowApiDocs={() => setShowApiDocs(true)} />
    </>
  );
}

export default App
