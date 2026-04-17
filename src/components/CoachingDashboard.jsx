import React, { useRef } from 'react';
import { MetricsPanel } from './MetricsPanel';
import { RealtimeGraph } from './RealtimeGraph';
import { FeedbackBoard } from './FeedbackBoard';
import { useAudioEngine } from '../hooks/useAudioEngine';

export const CoachingDashboard = () => {
  const graphRef = useRef(null);
  
  const { startEngine, stopEngine, isRunning, metrics, feedback } = useAudioEngine(graphRef);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
    </div>
  );
};
