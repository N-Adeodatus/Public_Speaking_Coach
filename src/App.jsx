import { useState, useEffect } from 'react'
import { CoachingDashboard } from './components/CoachingDashboard'
import { useThreads } from './hooks/useThreads'
import './index.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  const {
    threads, activeThreadId, setActiveThreadId, activeThread,
    createThread, updateThreadGoal, appendSession, loading: threadsLoading
  } = useThreads(isAuthenticated);

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
    <div className="app-layout" style={{ 
      display: 'flex', width: '100%', maxWidth: '1200px', margin: '0 auto', gap: '2rem',
      alignItems: 'flex-start'
    }}>
      {isAuthenticated && (
        <aside style={{ 
          width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem',
          background: 'var(--card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)',
          minHeight: '80vh'
        }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Threads</h2>
          <button onClick={createThread} className="btn-primary" style={{ width: '100%', padding: '0.75rem' }}>
            + New Thread
          </button>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem', overflowY: 'auto' }}>
            {threadsLoading ? (
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading threads...</div>
            ) : threads.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No practice threads yet.</div>
            ) : (
              threads.map(t => (
                <div 
                  key={t.id}
                  onClick={() => setActiveThreadId(t.id)}
                  style={{
                    padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer',
                    background: activeThreadId === t.id ? 'var(--surface)' : 'transparent',
                    border: `1px solid ${activeThreadId === t.id ? 'var(--border)' : 'transparent'}`,
                    color: activeThreadId === t.id ? 'var(--text)' : 'var(--muted)',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}
                >
                  {t.name}
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      <div className="app-container" style={{ flexGrow: 1 }}>
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
            
            <CoachingDashboard 
              activeThread={activeThread} 
              appendSession={appendSession} 
              updateThreadGoal={updateThreadGoal} 
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default App
