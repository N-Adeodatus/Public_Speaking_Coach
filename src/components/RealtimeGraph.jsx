import React, { useRef, useImperativeHandle, forwardRef, useEffect, useState } from 'react';

const MAX_PTS = 300;

const SERIES = [
  { key: 'f0',  color: '#6c8efb', label: 'Pitch F0', scale: v => v,        min: 0, max: 400 },
  { key: 'rms', color: '#4ade80', label: 'RMS',      scale: v => v * 1000, min: 0, max: 60  },
  { key: 'cv',  color: '#facc15', label: 'Pitch CV', scale: v => v * 100,  min: 0, max: 40  },
  { key: 'vad', color: '#f87171', label: 'VAD',      scale: v => v,        min: 0, max: 100 },
];

const DEFAULT_VISIBLE = { f0: true, rms: true, cv: true, vad: true };

export const RealtimeGraph = forwardRef((props, ref) => {
  const canvasRef  = useRef(null);
  const graphData  = useRef({ f0: [], rms: [], cv: [], vad: [] });

  // useState → drives the toggle pill UI
  // useRef  → read by the canvas render loop (avoids stale closure)
  const [visible, setVisible] = useState({ ...DEFAULT_VISIBLE });
  const visibleRef            = useRef({ ...DEFAULT_VISIBLE });

  const toggleSeries = (key) => {
    const next = { ...visibleRef.current, [key]: !visibleRef.current[key] };
    visibleRef.current = next;
    setVisible({ ...next });
  };

  // ── Imperative API exposed via ref ─────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    pushData: (f0, rms, isVoiced, cv) => {
      const g = graphData.current;
      g.f0.push(f0 > 0 ? f0 : 0);
      g.rms.push(rms);
      g.cv.push(cv !== null ? cv : 0);
      g.vad.push(isVoiced ? 100 : 0);
      for (const key of Object.keys(g)) {
        if (g[key].length > MAX_PTS) g[key].shift();
      }
    },
    clear: () => {
      const g = graphData.current;
      for (const key of Object.keys(g)) g[key] = [];
    },
    // legacy alias
    clearData: () => {
      const g = graphData.current;
      for (const key of Object.keys(g)) g[key] = [];
    },
  }));

  // ── Canvas render loop ─────────────────────────────────────────────────────
  useEffect(() => {
    let animationFrameId;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const gctx  = canvas.getContext('2d');
      const W     = canvas.width;
      const H     = canvas.height;
      const PAD_L = 8, PAD_R = 8, PAD_T = 18, PAD_B = 28;
      const plotW = W - PAD_L - PAD_R;
      const plotH = H - PAD_T - PAD_B;

      gctx.clearRect(0, 0, W, H);

      // Grid lines
      gctx.strokeStyle = 'rgba(255,255,255,0.04)';
      gctx.lineWidth   = 1;
      const gridLines  = 5;
      for (let i = 0; i <= gridLines; i++) {
        const y = PAD_T + (plotH / gridLines) * i;
        gctx.beginPath();
        gctx.moveTo(PAD_L, y);
        gctx.lineTo(W - PAD_R, y);
        gctx.stroke();
      }

      const totalPts = graphData.current.f0.length;
      if (totalPts > 1) {
        for (const s of SERIES) {
          // Respect toggle — read from ref to avoid stale closure
          if (!visibleRef.current[s.key]) continue;

          const buf  = graphData.current[s.key];
          const span = s.max - s.min;

          gctx.beginPath();
          gctx.strokeStyle = s.color;
          gctx.lineWidth   = 2;
          gctx.lineJoin    = 'round';
          gctx.shadowColor = s.color;
          gctx.shadowBlur  = 4;

          for (let i = 0; i < buf.length; i++) {
            const x      = PAD_L + (i / (MAX_PTS - 1)) * plotW;
            const scaled = s.scale(buf[i]);
            const norm   = Math.min(Math.max((scaled - s.min) / span, 0), 1);
            const y      = PAD_T + plotH * (1 - norm);
            if (i === 0) gctx.moveTo(x, y); else gctx.lineTo(x, y);
          }
          gctx.stroke();
          gctx.shadowBlur = 0;

          // Live value tip label
          if (buf.length > 0) {
            const tipX     = PAD_L + ((buf.length - 1) / (MAX_PTS - 1)) * plotW;
            const last     = s.scale(buf[buf.length - 1]);
            const normLast = Math.min(Math.max((last - s.min) / s.max, 0), 1);
            const tipY     = PAD_T + plotH * (1 - normLast) - 6;
            gctx.fillStyle  = s.color;
            gctx.font       = 'bold 10px monospace';
            gctx.textAlign  = 'left';
            const displayVal = last.toFixed(last < 10 ? 2 : 0);
            gctx.fillText(displayVal, Math.min(tipX + 4, W - PAD_R - 36), Math.max(tipY, PAD_T + 10));
          }
        }
      }

      // Time axis labels
      gctx.fillStyle  = 'rgba(100,116,139,0.7)';
      gctx.font       = '10px sans-serif';
      gctx.textAlign  = 'left';
      gctx.fillText('oldest', PAD_L, H - 8);
      gctx.textAlign  = 'right';
      gctx.fillText('now', W - PAD_R, H - 8);

      animationFrameId = window.requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      const parent = canvasRef.current?.parentElement;
      if (parent && canvasRef.current) {
        canvasRef.current.width  = parent.clientWidth;
        canvasRef.current.height = 260;
      }
    };
    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 50);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mt-6">

      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-border flex-wrap">

        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground shrink-0">
          📈 Real-time Graph
        </span>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Series toggle pills — all on by default */}
          {SERIES.map(s => {
            const on = visible[s.key];
            return (
              <button
                key={s.key}
                onClick={() => toggleSeries(s.key)}
                title={on ? `Hide ${s.label}` : `Show ${s.label}`}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150 select-none ${
                  on
                    ? 'text-foreground'
                    : 'text-muted-foreground border-border opacity-40'
                }`}
                style={on ? {
                  backgroundColor: s.color + '1a',
                  borderColor:     s.color + '66',
                } : {}}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: s.color, opacity: on ? 1 : 0.35 }}
                />
                {s.label}
              </button>
            );
          })}

          {/* Divider */}
          <span className="h-4 w-px bg-border" />

          {/* Clear */}
          <button
            onClick={() => ref.current?.clearData()}
            className="px-2.5 py-1 rounded-full text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all duration-150"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '260px', display: 'block', background: 'transparent' }}
      />
    </div>
  );
});
