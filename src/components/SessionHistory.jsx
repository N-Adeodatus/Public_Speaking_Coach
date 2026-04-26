import React, { useEffect, useState, useCallback } from 'react';

const PAGE_SIZE = 3; // sessions shown by default, load more adds another PAGE_SIZE

// ── helpers ─────────────────────────────────────────────────────────────────
function formatDate(isoTimestamp) {
  try {
    // session filenames use dashes: 2026-04-20T19-28-52-503Z → restore colons
    const normalized = isoTimestamp.replace(/T(\d{2})-(\d{2})-(\d{2})-/, 'T$1:$2:$3.');
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(normalized));
  } catch {
    return isoTimestamp;
  }
}

function formatDuration(sec) {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

// ── SessionCard ──────────────────────────────────────────────────────────────
function SessionCard({ session, index }) {
  const [expanded, setExpanded] = useState(false);

  const pauseCount   = session.pauses?.length ?? 0;
  const eventCount   = session.events?.length ?? 0;
  const summaryText  = session.aiSummary ?? null;
  const preview      = summaryText ? summaryText.slice(0, 160).trimEnd() + (summaryText.length > 160 ? '…' : '') : null;

  return (
    <div
      className="card"
      style={{
        padding: '1.25rem 1.5rem',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: 'var(--card)',
        transition: 'border-color 0.2s',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700, color: '#fff',
          }}>
            {index}
          </span>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
              {formatDate(session.timestamp)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
              {formatDuration(session.durationSec)} of active speech
            </div>
          </div>
        </div>

        {/* Stat chips */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {eventCount > 0 && (
            <Chip color="var(--accent)" label={`${eventCount} phrases`} />
          )}
          {pauseCount > 0 && (
            <Chip color="var(--yellow)" label={`${pauseCount} pauses`} />
          )}
          {!summaryText && (
            <Chip color="var(--muted)" label="No AI summary" />
          )}
        </div>

        <span style={{ color: 'var(--muted)', fontSize: '0.8rem', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Summary preview or full text */}
      {summaryText && (
        <div style={{
          fontSize: '0.82rem',
          lineHeight: 1.65,
          color: expanded ? 'var(--text)' : 'var(--muted)',
          borderTop: '1px solid var(--border)',
          paddingTop: '0.75rem',
          whiteSpace: 'pre-wrap',
        }}>
          {expanded ? summaryText : preview}
        </div>
      )}

      {/* Expanded pause breakdown */}
      {expanded && session.pauses?.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>
            Pause breakdown
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['micro','short','long','very_long'].map(cat => {
              const count = session.pauses.filter(p => p.category === cat).length;
              if (!count) return null;
              return <Chip key={cat} color="var(--accent)" label={`${count} ${cat.replace('_',' ')}`} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ color, label }) {
  return (
    <span style={{
      fontSize: '0.72rem', fontWeight: 600,
      padding: '0.2rem 0.6rem', borderRadius: '20px',
      border: `1px solid ${color}`,
      color, background: `${color}18`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ── SessionHistory ───────────────────────────────────────────────────────────
export const SessionHistory = ({ activeThread }) => {
  const [loaded, setLoaded] = useState(PAGE_SIZE);

  if (!activeThread) return null;

  const allSessions = activeThread.sessions || [];
  const totalCount = allSessions.length;
  // display newest first
  const reversedSessions = [...allSessions].reverse();
  const visibleSessions = reversedSessions.slice(0, loaded);

  const handleLoadMore = () => setLoaded(prev => prev + PAGE_SIZE);

  return (
    <div style={{ marginTop: '2rem' }}>
      {/* Section header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem',
      }}>
        <div>
          <span style={{
            fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '1.5px',
            color: 'var(--muted)',
          }}>
            📂 Session History
          </span>
          {totalCount > 0 && (
            <span style={{ marginLeft: '0.75rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
              ({totalCount} total)
            </span>
          )}
        </div>
      </div>

      {/* Empty state */}
      {visibleSessions.length === 0 && (
        <div style={{
          padding: '2rem', textAlign: 'center', borderRadius: '12px',
          border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: '0.85rem',
        }}>
          No sessions in this thread yet. Start practicing!
        </div>
      )}

      {/* Session cards — newest first = index 1 is most recent */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {visibleSessions.map((s, i) => (
          <SessionCard key={s.timestamp ?? i} session={s} index={totalCount - i} />
        ))}
      </div>

      {/* Load more */}
      {visibleSessions.length > 0 && loaded < totalCount && (
        <button
          onClick={handleLoadMore}
          className="btn-secondary"
          style={{ marginTop: '1rem', width: '100%' }}
        >
          {`Show more (${totalCount - loaded} remaining)`}
        </button>
      )}
    </div>
  );
};
