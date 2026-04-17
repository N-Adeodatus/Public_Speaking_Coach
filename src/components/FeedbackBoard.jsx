import React from 'react';
import './FeedbackBoard.css';

export const FeedbackBoard = ({ feedback }) => {
  const { message, severity } = feedback || { message: 'Press Start to Begin', severity: 'neutral' };
  
  let colorClass = '';
  if (severity === 'green') colorClass = 'c-green';
  if (severity === 'yellow') colorClass = 'c-yellow';
  if (severity === 'red') colorClass = 'c-red';

  // Adaptive font: shrink for long AI summaries so they don't overflow
  const fontSize = message.length > 120 ? '0.95rem'
    : message.length > 60 ? '1.3rem'
    : '1.8rem';

  return (
    <div className="status-panel" style={{ width: '100%', marginBottom: '2rem', textAlign: 'center' }}>
      <div id="feedback-board" className={colorClass} style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '2rem 1.5rem',
        fontSize,
        fontWeight: message.length > 60 ? 400 : 600,
        lineHeight: 1.6,
        minHeight: '150px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        transition: 'font-size 0.3s ease, color 0.3s ease'
      }}>
        {message}
      </div>
    </div>
  );
};
