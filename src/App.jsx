import { useState, useEffect } from 'react'
import { CoachingDashboard } from './components/CoachingDashboard'
import { LandingPage } from './components/LandingPage'
import { useThreads } from './hooks/useThreads'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/AppSidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Mic } from 'lucide-react'
import './index.css'

// Demo thread used when the user tries the app without signing in
const DEMO_THREAD = {
  id: 'demo',
  name: 'Demo Session',
  goal: 'Try out the coaching engine',
  sessions: [],
  createdAt: new Date().toISOString(),
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [forceLanding, setForceLanding] = useState(false);

  const {
    threads, activeThreadId, setActiveThreadId, activeThread,
    createThread, deleteThread, updateThreadGoal, appendSession, loading: threadsLoading
  } = useThreads(isAuthenticated);

  useEffect(() => {
    if (puter.auth.isSignedIn()) {
      setIsAuthenticated(true);
      puter.auth.getUser().then(setUser);
    }
  }, []);

  const handleLogin = async () => {
    try {
      await puter.auth.signIn();
      setIsAuthenticated(true);
      setIsDemoMode(false);
      setForceLanding(false);
      const u = await puter.auth.getUser();
      setUser(u);
    } catch (e) {
      console.error("Login failed:", e);
    }
  };

  const handleLogout = () => {
    puter.auth.signOut();
    setIsAuthenticated(false);
    setIsDemoMode(false);
    setForceLanding(false);
    setUser(null);
  };

  const handleTryDemo = () => {
    setIsDemoMode(true);
    setForceLanding(false);
  };

  const handleLogoClick = () => {
    setIsDemoMode(false);
    setForceLanding(true);
  };

  // Show Landing Page when not authenticated, not in demo mode, or logo was clicked
  if ((!isAuthenticated && !isDemoMode) || forceLanding) {
    return (
      <LandingPage
        onLogin={handleLogin}
        onTryDemo={handleTryDemo}
        onContinue={isAuthenticated ? () => setForceLanding(false) : null}
      />
    );
  }

  // Determine the active thread (real or demo)
  const currentThread = isAuthenticated ? activeThread : DEMO_THREAD;
  // appendSession is a no-op in demo mode (data won't persist)
  const currentAppendSession = isAuthenticated ? appendSession : null;
  const currentUpdateThreadGoal = isAuthenticated ? updateThreadGoal : () => {};

  return (
    <SidebarProvider>
      {isAuthenticated && (
        <AppSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          setActiveThreadId={setActiveThreadId}
          createThread={createThread}
          deleteThread={deleteThread}
          threadsLoading={threadsLoading}
          onLogoClick={handleLogoClick}
        />
      )}

      <main className="flex-1 w-full flex flex-col min-h-screen relative p-4 md:p-8 overflow-y-auto">
        {isAuthenticated && (
          <div className="absolute top-4 left-4 md:hidden">
            <SidebarTrigger />
          </div>
        )}

        <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 pt-10 md:pt-0">
          <header className="flex items-center justify-between">
            <button
              onClick={handleLogoClick}
              className="text-left group"
              title="Back to home"
            >
              <h1 className="text-2xl font-bold bg-gradient-to-br from-primary to-purple-400 bg-clip-text text-transparent flex items-center gap-2 group-hover:opacity-80 transition-opacity">
                <Mic className="h-6 w-6 text-primary" />
                PS Coach
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">Real-time behavioral feedback engine</p>
            </button>
            <div className="flex items-center gap-3">
              {isDemoMode && (
                <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 bg-yellow-500/5 gap-1.5">
                  Demo Mode — sessions won't be saved
                </Badge>
              )}
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground hidden sm:block">Welcome, {user?.username}</span>
                  <Button onClick={handleLogout} variant="outline" size="sm">Logout</Button>
                </div>
              ) : (
                <Button onClick={handleLogin} size="sm" className="gap-2">
                  <Mic className="h-3.5 w-3.5" />
                  Sign In to Save
                </Button>
              )}
            </div>
          </header>

          <CoachingDashboard
            activeThread={currentThread}
            appendSession={currentAppendSession}
            updateThreadGoal={currentUpdateThreadGoal}
          />
        </div>
      </main>
    </SidebarProvider>
  );
}

export default App
