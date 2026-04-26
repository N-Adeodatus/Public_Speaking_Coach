import React, { useRef } from 'react';
import { MetricsPanel } from './MetricsPanel';
import { RealtimeGraph } from './RealtimeGraph';
import { FeedbackBoard } from './FeedbackBoard';
import { SessionHistory } from './SessionHistory';
import { useAudioEngine } from '../hooks/useAudioEngine';

export const CoachingDashboard = ({ activeThread, appendSession, updateThreadGoal }) => {
  const graphRef = useRef(null);
  
  const { startEngine, stopEngine, isRunning, metrics, feedback } = useAudioEngine(graphRef, activeThread, appendSession);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      
      {/* Thread Goal Input */}
      {activeThread && (
        <div style={{
          background: 'var(--card)', padding: '1rem 1.5rem', borderRadius: '12px',
          border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1rem',
          marginBottom: '1rem'
        }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
            🎯 Thread Goal
          </label>
          <input
            type="text"
            placeholder="e.g. Reduce filler words and maintain eye contact..."
            value={activeThread.goal}
            onChange={(e) => updateThreadGoal(activeThread.id, e.target.value)}
            style={{
              flexGrow: 1, background: 'transparent', border: 'none', color: 'var(--text)',
              fontSize: '0.9rem', outline: 'none'
            }}
          />
        </div>
      )}

      <div className="controls" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem' }}>
        <button 
          onClick={startEngine} 
          disabled={isRunning} 
          className="btn-primary"
          style={{ opacity: isRunning ? 0.5 : 1 }}
        >
          ▶ Start Microphone
        </button>
        <button 
          onClick={stopEngine} 
          disabled={!isRunning} 
          className="btn-secondary"
          style={{ background: 'var(--red)', color: 'white', borderColor: 'var(--red)', opacity: !isRunning ? 0.5 : 1 }}
        >
          ⏹ Stop
        </button>
      </div>

      <FeedbackBoard feedback={feedback} />
      <MetricsPanel {...metrics} />
      <RealtimeGraph ref={graphRef} />
      <SessionHistory activeThread={activeThread} />
    </div>
  );
};
