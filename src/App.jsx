import { useState, useEffect } from 'react'
import { CoachingDashboard } from './components/CoachingDashboard'
import { useThreads } from './hooks/useThreads'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/AppSidebar"
import { Button } from "@/components/ui/button"
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
    <SidebarProvider>
      {isAuthenticated && (
        <AppSidebar 
          threads={threads} 
          activeThreadId={activeThreadId} 
          setActiveThreadId={setActiveThreadId} 
          createThread={createThread} 
          threadsLoading={threadsLoading} 
        />
      )}

      <main className="flex-1 w-full flex flex-col min-h-screen relative p-4 md:p-8 overflow-y-auto">
        {isAuthenticated && (
          <div className="absolute top-4 left-4 md:hidden">
            <SidebarTrigger />
          </div>
        )}

        <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 pt-10 md:pt-0">
          <header className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-br from-primary to-purple-400 bg-clip-text text-transparent">
              🎙️ PS Coach
            </h1>
            <p className="text-muted-foreground mt-2">Real-time behavioral feedback engine</p>
          </header>
          
          {!isAuthenticated ? (
            <div className="text-center bg-card p-12 rounded-2xl border border-border flex flex-col items-center gap-6 max-w-md mx-auto w-full">
              <p className="text-foreground">Please log in to track your progression and save your sessions.</p>
              <Button onClick={handleLogin} size="lg" className="w-full">Login with Puter</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-center text-muted-foreground">
                <span className="text-sm">Welcome, {user?.username}</span>
                <Button onClick={handleLogout} variant="outline" size="sm">Logout</Button>
              </div>
              
              <CoachingDashboard 
                activeThread={activeThread} 
                appendSession={appendSession} 
                updateThreadGoal={updateThreadGoal} 
              />
            </div>
          )}
        </div>
      </main>
    </SidebarProvider>
  )
}

export default App
