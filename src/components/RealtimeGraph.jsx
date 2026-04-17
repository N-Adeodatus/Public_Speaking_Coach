import React, { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';

const MAX_PTS = 300;

export const RealtimeGraph = forwardRef((props, ref) => {
  const canvasRef = useRef(null);
  
  const graphData = useRef({
    f0: [],
    rms: [],
    cv: [],
    vad: []
  });

  const SERIES = [
    { key: 'f0', color: '#6c8efb', label: 'Pitch F0', scale: v => v, min: 0, max: 400 },
    { key: 'rms', color: '#4ade80', label: 'RMS', scale: v => v * 1000, min: 0, max: 60 },
    { key: 'cv', color: '#facc15', label: 'Pitch CV', scale: v => v * 100, min: 0, max: 40 },
    { key: 'vad', color: '#f87171', label: 'VAD', scale: v => v, min: 0, max: 100 },
  ];

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
    clearData: () => {
      const g = graphData.current;
      for (const key of Object.keys(g)) g[key] = [];
    }
  }));

  useEffect(() => {
    let animationFrameId;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const gctx = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;
      const PAD_L = 8, PAD_R = 8, PAD_T = 18, PAD_B = 28;
      const plotW = W - PAD_L - PAD_R;
      const plotH = H - PAD_T - PAD_B;

      gctx.clearRect(0, 0, W, H);
      gctx.strokeStyle = 'rgba(255,255,255,0.04)';
      gctx.lineWidth = 1;
      const gridLines = 5;
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
          const buf = graphData.current[s.key];
          const span = s.max - s.min;

          gctx.beginPath();
          gctx.strokeStyle = s.color;
          gctx.lineWidth = 2;
          gctx.lineJoin = 'round';
          gctx.shadowColor = s.color;
          gctx.shadowBlur = 4;

          for (let i = 0; i < buf.length; i++) {
            const x = PAD_L + (i / (MAX_PTS - 1)) * plotW;
            const scaled = s.scale(buf[i]);
            const norm = Math.min(Math.max((scaled - s.min) / span, 0), 1);
            const y = PAD_T + plotH * (1 - norm);
            if (i === 0) gctx.moveTo(x, y); else gctx.lineTo(x, y);
          }
          gctx.stroke();
          gctx.shadowBlur = 0;

          if (buf.length > 0) {
            const tipX = PAD_L + ((buf.length - 1) / (MAX_PTS - 1)) * plotW;
            const last = s.scale(buf[buf.length - 1]);
            const normLast = Math.min(Math.max((last - s.min) / s.max, 0), 1);
            const tipY = PAD_T + plotH * (1 - normLast) - 6;
            gctx.fillStyle = s.color;
            gctx.font = 'bold 10px monospace';
            gctx.textAlign = 'left';
            const displayVal = last.toFixed(last < 10 ? 2 : 0);
            gctx.fillText(displayVal, Math.min(tipX + 4, W - PAD_R - 36), Math.max(tipY, PAD_T + 10));
          }
        }
      }

      gctx.fillStyle = 'rgba(100,116,139,0.8)';
      gctx.font = '10px sans-serif';
      gctx.textAlign = 'left';
      gctx.fillText('oldest', PAD_L, H - 8);
      gctx.textAlign = 'right';
      gctx.fillText('now', W - PAD_R, H - 8);

      animationFrameId = window.requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      const parent = canvasRef.current?.parentElement;
      if (parent && canvasRef.current) {
        canvasRef.current.width = parent.clientWidth;
        canvasRef.current.height = 260;
      }
    };
    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 50); // initial resize

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="graph-panel card" style={{ marginTop: '1.5rem', padding: '1.5rem' }}>
      <div className="panel-header" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
        <span className="panel-title" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--muted)' }}>📈 Real-time Metrics Graph</span>
        <button onClick={() => ref.current?.clearData()} className="btn-secondary" style={{ padding: '0.35rem 0.9rem', fontSize: '0.75rem' }}>Clear</button>
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: '260px', background: 'var(--surface)', borderRadius: '8px' }} />
    </div>
  );
});
