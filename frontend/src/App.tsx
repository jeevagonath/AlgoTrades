import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import LoginPage from './pages/LoginPage'
import { authApi } from './services/api.service'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const handleLogout = () => {
    // Clear any local storage or session data
    localStorage.clear();
    sessionStorage.clear();
    setIsAuthenticated(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#05080f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <>
      {isAuthenticated ? <Dashboard onLogout={handleLogout} /> : <LoginPage onLogin={handleLogin} />}
    </>
  )
}

export default App
