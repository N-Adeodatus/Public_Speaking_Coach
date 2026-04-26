import { useState, useEffect, useCallback } from 'react';

const THREADS_DIR = 'ps-coach-threads';
const INDEX_FILE = `${THREADS_DIR}/index.json`;

export const useThreads = (isSignedIn) => {
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Initialize Directory & Load Index ──────────────────────────────────────
  const loadThreads = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    try {
      // Ensure directory exists
      try {
        await puter.fs.mkdir(THREADS_DIR);
      } catch (err) {
        if (!err.message?.toLowerCase().includes('exist') && !err.code?.toLowerCase().includes('exist')) {
          throw err;
        }
      }

      // Read index.json
      let indexData = [];
      try {
        const blob = await puter.fs.read(INDEX_FILE);
        const text = await blob.text();
        indexData = JSON.parse(text);
      } catch (err) {
        // If index doesn't exist, start with empty array
        await puter.fs.write(INDEX_FILE, JSON.stringify([]));
      }

      // Sort newest first
      indexData.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setThreads(indexData);

      // Set active thread if none selected
      if (indexData.length > 0 && !activeThreadId) {
        setActiveThreadId(indexData[0].id);
      } else if (indexData.length === 0) {
        // Auto-create first thread if completely empty
        await createThread();
      }
    } catch (err) {
      console.error('Failed to load threads:', err);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, activeThreadId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // ── Load Active Thread Data ────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const fetchActiveThread = async () => {
      if (!activeThreadId || !isSignedIn) return;
      try {
        const blob = await puter.fs.read(`${THREADS_DIR}/thread_${activeThreadId}.json`);
        const text = await blob.text();
        if (mounted) setActiveThread(JSON.parse(text));
      } catch (err) {
        console.error('Failed to load active thread:', err);
        if (mounted) setActiveThread(null);
      }
    };
    fetchActiveThread();
    return () => { mounted = false; };
  }, [activeThreadId, isSignedIn]);

  // ── Create New Thread ──────────────────────────────────────────────────────
  const createThread = async () => {
    if (!isSignedIn) return;
    try {
      const id = Date.now().toString();
      const timestamp = new Date().toISOString();
      const newThreadMeta = {
        id,
        name: `Practice ${threads.length + 1}`,
        goal: '',
        updatedAt: timestamp
      };

      const newThreadFull = {
        ...newThreadMeta,
        sessions: []
      };

      // Write full thread file
      await puter.fs.write(`${THREADS_DIR}/thread_${id}.json`, JSON.stringify(newThreadFull, null, 2));

      // Update index
      const updatedThreads = [newThreadMeta, ...threads];
      await puter.fs.write(INDEX_FILE, JSON.stringify(updatedThreads, null, 2));

      setThreads(updatedThreads);
      setActiveThreadId(id);
    } catch (err) {
      console.error('Failed to create thread:', err);
    }
  };

  // ── Update Thread Goal ─────────────────────────────────────────────────────
  const updateThreadGoal = async (id, newGoal) => {
    if (!isSignedIn) return;
    try {
      // Update index
      const updatedThreads = threads.map(t => 
        t.id === id ? { ...t, goal: newGoal, updatedAt: new Date().toISOString() } : t
      );
      await puter.fs.write(INDEX_FILE, JSON.stringify(updatedThreads, null, 2));
      setThreads(updatedThreads);

      // Update full file if it's active
      if (activeThread?.id === id) {
        const updatedFull = { ...activeThread, goal: newGoal };
        await puter.fs.write(`${THREADS_DIR}/thread_${id}.json`, JSON.stringify(updatedFull, null, 2));
        setActiveThread(updatedFull);
      } else {
        // If not active, read, update, write
        const blob = await puter.fs.read(`${THREADS_DIR}/thread_${id}.json`);
        const text = await blob.text();
        const full = JSON.parse(text);
        full.goal = newGoal;
        await puter.fs.write(`${THREADS_DIR}/thread_${id}.json`, JSON.stringify(full, null, 2));
      }
    } catch (err) {
      console.error('Failed to update thread goal:', err);
    }
  };

  // ── Append Session (called by useAudioEngine) ──────────────────────────────
  const appendSession = async (sessionData) => {
    if (!activeThreadId || !activeThread || !isSignedIn) return null;
    
    try {
      const updatedFull = {
        ...activeThread,
        sessions: [...activeThread.sessions, sessionData]
      };
      
      const timestamp = new Date().toISOString();
      await puter.fs.write(`${THREADS_DIR}/thread_${activeThreadId}.json`, JSON.stringify(updatedFull, null, 2));
      setActiveThread(updatedFull);

      // Update index updatedAt
      const updatedThreads = threads.map(t => 
        t.id === activeThreadId ? { ...t, updatedAt: timestamp } : t
      );
      // Move active to top
      updatedThreads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      await puter.fs.write(INDEX_FILE, JSON.stringify(updatedThreads, null, 2));
      setThreads(updatedThreads);
      
      return updatedFull;
    } catch (err) {
      console.error('Failed to append session:', err);
      throw err;
    }
  };

  return {
    threads,
    activeThreadId,
    setActiveThreadId,
    activeThread,
    loading,
    createThread,
    updateThreadGoal,
    appendSession
  };
};
