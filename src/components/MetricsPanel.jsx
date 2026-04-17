import React from 'react';

export const MetricsPanel = ({ f0, cv, rms, isVoiced }) => {
  return (
    <div className="metrics-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
      <div className="card" style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div className="card-label" style={{ fontSize: '0.7rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Pitch (F0)</div>
        <div className="metric-value" style={{ fontSize: '2rem', fontFamily: 'monospace', fontWeight: 600 }}>{typeof f0 === 'number' && f0 > 0 ? f0.toFixed(1) : '—'}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Hz</div>
      </div>
      <div className="card" style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div className="card-label" style={{ fontSize: '0.7rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Pitch Variance (CV)</div>
        <div className="metric-value" style={{ fontSize: '2rem', fontFamily: 'monospace', fontWeight: 600 }}>{typeof cv === 'number' ? cv.toFixed(3) : '—'}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>CV</div>
      </div>
      <div className="card" style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div className="card-label" style={{ fontSize: '0.7rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>RMS (Loudness)</div>
        <div className="metric-value" style={{ fontSize: '2rem', fontFamily: 'monospace', fontWeight: 600 }}>{typeof rms === 'number' ? rms.toFixed(4) : '—'}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>raw avg</div>
      </div>
      <div className="card" style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div className="card-label" style={{ fontSize: '0.7rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Voice Activity</div>
        <div className="metric-value" style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '0.5rem', color: isVoiced ? 'var(--green)' : 'var(--muted)' }}>
          {isVoiced ? '🟢 Voiced' : '⚫ Silence'}
        </div>
      </div>
    </div>
  );
};
