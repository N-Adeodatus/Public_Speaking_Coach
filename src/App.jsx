import { useState, useEffect } from 'react'
import { CoachingDashboard } from './components/CoachingDashboard'
import './index.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Puter.js Auth Check on Load
    if (puter.auth.isSignedIn()) {
      setIsAuthenticated(true);
      puter.auth.getUser().then(setUser);
    }
  }, []);

  const handleLogin = async () => {
    try {
      await puter.auth.signIn();
      setIsAuthenticated(true);
      const u = await puter.auth.getUser();
      setUser(u);
    } catch (e) {
      console.error("Login failed:", e);
    }
  };

  const handleLogout = () => {
    puter.auth.signOut();
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <div className="app-container">
      <header>
        <h1>🎙️ PS Coach</h1>
        <p>Real-time behavioral feedback engine</p>
      </header>
      
      {!isAuthenticated ? (
        <div className="login-screen">
          <p>Please log in to track your progression and save your sessions.</p>
          <button onClick={handleLogin} className="btn-primary">Login with Puter</button>
        </div>
      ) : (
        <div className="dashboard-container">
          <div className="user-info">
            <span>Welcome, {user?.username}</span>
            <button onClick={handleLogout} className="btn-secondary">Logout</button>
          </div>
          <CoachingDashboard />
        </div>
      )}
    </div>
  )
}

export default App
