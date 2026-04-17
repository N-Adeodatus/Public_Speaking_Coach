import { useState, useRef, useEffect, useCallback } from 'react';
import { EventEngine } from '../lib/EventEngine';

export const useAudioEngine = (graphRef) => {
  const [isRunning, setIsRunning] = useState(false);
  const [metrics, setMetrics] = useState({ f0: 0, cv: null, rms: 0, isVoiced: false });
  const [feedback, setFeedback] = useState(null);
  
  const audioCtxRef = useRef(null);
  const workletNodeRef = useRef(null);
  const streamRef = useRef(null);
  
  const eventEngineRef = useRef(new EventEngine());

  // Tier 1.5 & Tier 2: Buffers
  const messageBufferRef = useRef([]);
  const lastStateUpdateRef = useRef(0);
  const phraseAccumulatorRef = useRef({ f0s: [], rmsVals: [], lastVoicedTime: 0 });
  const sessionHistoryRef = useRef([]);
  const sessionStartRef = useRef(null);

  // Session-wide running stats for rich AI prompt
  const sessionStatsRef = useRef({ cvSamples: [], rmsSamples: [], voicedFrames: 0, totalFrames: 0 });

  const processBuffer = useCallback(() => {
    const messages = messageBufferRef.current;
    if (messages.length === 0) return;

    // We process the latest state for UI, but push all frames to the graph
    const latest = messages[messages.length - 1];

    for (const msg of messages) {
      if (graphRef.current) {
        graphRef.current.pushData(msg.f0, msg.rms, msg.isVoiced, msg.cv);
      }

      // Accumulate session-wide stats
      const stats = sessionStatsRef.current;
      stats.totalFrames++;
      if (msg.isVoiced) stats.voicedFrames++;
      if (typeof msg.rms === 'number') stats.rmsSamples.push(msg.rms);

      // Tier 2: Phrase Aggregation Logic based on VAD
      if (msg.isVoiced) {
        phraseAccumulatorRef.current.f0s.push(msg.f0);
        phraseAccumulatorRef.current.rmsVals.push(msg.rms);
        phraseAccumulatorRef.current.lastVoicedTime = performance.now();
      } else {
        const timeSinceVoiced = performance.now() - (phraseAccumulatorRef.current.lastVoicedTime || performance.now());
        if (timeSinceVoiced > 800) {
          if (phraseAccumulatorRef.current.f0s.length > 10) {
              const result = eventEngineRef.current.processPhrase(phraseAccumulatorRef.current);
              // Accumulate per-phrase CV for the session stat
              if (result?.event?.features?.pitchCV != null) {
                stats.cvSamples.push(result.event.features.pitchCV);
              }
              if (result?.event) sessionHistoryRef.current.push(result.event);
              if (result?.feedback) setFeedback(result.feedback);
          }
          phraseAccumulatorRef.current = { f0s: [], rmsVals: [], lastVoicedTime: 0 };
        }
      }
    }

    // Throttled UI state updates (Tier 5 protection) ~200ms
    const now = performance.now();
    if (now - lastStateUpdateRef.current > 200) {
      setMetrics({
        f0: latest.f0,
        cv: latest.cv, // coming straight from worklet or compute here
        rms: latest.rms,
        isVoiced: latest.isVoiced,
      });
      lastStateUpdateRef.current = now;
    }

    messageBufferRef.current = [];
  }, [graphRef]);

  // Set up flush interval (Tier 1.5 Ring Buffer smoothing)
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(processBuffer, 50); // flush every 50ms
    return () => clearInterval(interval);
  }, [isRunning, processBuffer]);

  const startEngine = async () => {
    try {
      setFeedback({ message: "Loading Engine...", severity: "yellow" });
      // Reset session state
      sessionHistoryRef.current = [];
      sessionStartRef.current = Date.now();
      sessionStatsRef.current = { cvSamples: [], rmsSamples: [], voicedFrames: 0, totalFrames: 0 };
      eventEngineRef.current.resetSession();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const actx = new AudioContext();
      audioCtxRef.current = actx;

      await actx.audioWorklet.addModule('/essentia_worklet.js');
      const node = new AudioWorkletNode(actx, 'coach-processor');
      workletNodeRef.current = node;

      node.port.onmessage = (e) => {
        if (e.data.type === 'METRICS') {
          messageBufferRef.current.push(e.data);
        }
      };

      const source = actx.createMediaStreamSource(stream);
      source.connect(node);

      setIsRunning(true);
      setFeedback({ message: "Running... Ready to coach!", severity: "green" });
    } catch (err) {
      console.error(err);
      setFeedback({ message: `Error: ${err.message}`, severity: "red" });
    }
  };

  const stopEngine = async () => {
    // Stop all audio tracks
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (workletNodeRef.current) workletNodeRef.current.disconnect();
    // Await close to prevent the AudioContext hang
    if (audioCtxRef.current) await audioCtxRef.current.close();
    audioCtxRef.current = null;
    workletNodeRef.current = null;
    streamRef.current = null;
    setIsRunning(false);

    const events = sessionHistoryRef.current;
    const durationSec = Math.round((Date.now() - (sessionStartRef.current || Date.now())) / 1000);

    setFeedback({ message: '⏳ Analyzing session with AI...', severity: 'yellow' });

    try {
      if (!puter.auth.isSignedIn()) {
        setFeedback({ message: 'Session complete! Sign in to unlock AI summaries.', severity: 'yellow' });
        return;
      }

      // Build rich quantitative context from session stats
      const stats = sessionStatsRef.current;
      const avgCV = stats.cvSamples.length > 0
        ? (stats.cvSamples.reduce((a, b) => a + b, 0) / stats.cvSamples.length).toFixed(3)
        : 'N/A';
      const avgRMS = stats.rmsSamples.length > 0
        ? (stats.rmsSamples.reduce((a, b) => a + b, 0) / stats.rmsSamples.length).toFixed(4)
        : 'N/A';
      const voicedPct = stats.totalFrames > 0
        ? Math.round((stats.voicedFrames / stats.totalFrames) * 100)
        : 0;

      // CV interpretation guide for the AI
      const cvGuide = avgCV === 'N/A' ? '' : (() => {
        const v = parseFloat(avgCV);
        if (v < 0.08) return 'This is a very low pitch variance — the delivery sounded quite monotone.';
        if (v < 0.12) return 'This is below-average pitch variance — delivery was somewhat flat.';
        if (v <= 0.20) return 'This is a healthy pitch variance — delivery had good natural expressiveness.';
        return 'This is high pitch variance — delivery was very expressive and dynamic.';
      })();

      // Build moment-first evidence slices (sorted by session time)
      const namedEvents = events.filter(ev => ev.type !== 'normal_phrase' && ev.confidence != null);
      const allPhrases  = events.filter(ev => ev.evidence); // all logged phrases for context

      // Format each named event as a time-anchored micro-summary
      const evidenceSlices = namedEvents.map((ev, i) => {
        const e = ev.evidence;
        const offset = e.sessionOffsetSec != null ? `~${e.sessionOffsetSec}s in` : `phrase ${i+1}`;
        const pitchDesc = e.pitchTrend === 'flat'
          ? `pitch stayed narrow (${e.pitchMin}–${e.pitchMax} Hz, CV ${e.pitchCV})`
          : `pitch was ${e.pitchTrend} (${e.pitchMin}→${e.pitchMax} Hz)`;
        const rmsDesc = `volume was ${e.rmsTrend} (avg RMS ${e.rmsAvg})`;
        return `• [${offset}, ${e.durationSec}s phrase] ${ev.type.replace(/_/g,' ')}: ${pitchDesc}, ${rmsDesc}`;
      }).join('\n');

      // Normal phrase snapshots for context (show up to 3)
      const normalSnapshots = allPhrases
        .filter(ev => ev.type === 'normal_phrase')
        .slice(0, 3)
        .map((ev, i) => {
          const e = ev.evidence;
          return `• [~${e.sessionOffsetSec}s] Normal phrase: pitch ${e.pitchTrend}, ${e.pitchMin}–${e.pitchMax} Hz, RMS ${e.rmsAvg} (${e.rmsTrend})`;
        }).join('\n');

      const certaintyNote = durationSec < 45
        ? `NOTE: This is a short sample (${durationSec}s). Treat observations as early signals, not definitive diagnosis.`
        : `Session length (${durationSec}s) is sufficient for moderate confidence in these observations.`;

      const prompt = `You are a professional public speaking coach. Analyze this session with micro-evidence first, then global patterns.

${certaintyNote}

Session stats:
- Duration: ${durationSec}s, Speaking ratio: ${voicedPct}%
- Avg pitch CV: ${avgCV} (${cvGuide})
- Avg loudness: ${avgRMS} RMS

Time-stamped phrase evidence:
${evidenceSlices || '(no named events detected)'}

Additional normal phrase samples:
${normalSnapshots || '(not enough phrases logged)'}

Write a 5-6 sentence coaching response structured as:
1. Reference 2-3 SPECIFIC moments from the evidence above by timestamp and what exactly happened acoustically (pitch, volume, trend)
2. Identify the pattern those moments reveal about their delivery style
3. Give ONE concrete, actionable technique — explain WHY it improves the specific issue seen in the data
Be honest and precise. Avoid vague encouragement. The learner is trying to improve.`;

      const response = await puter.ai.chat(prompt, { model: 'anthropic/claude-sonnet-4-6' });

      // Puter AI can return a string, or a structured object — handle both
      let summary = 'Great session!';
      if (typeof response === 'string') {
        summary = response;
      } else if (typeof response?.toString === 'function') {
        const str = response.toString();
        if (str !== '[object Object]') summary = str;
      }
      if (response?.message?.content?.[0]?.text) {
        summary = response.message.content[0].text;
      }

      // Save compressed session log to Puter FS under /ps-coach-sessions/
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sessionLog = JSON.stringify({ timestamp, durationSec, events }, null, 2);
        await puter.fs.write(`/ps-coach-sessions/session-${timestamp}.json`, sessionLog);
      } catch (fsErr) {
        console.warn('Could not save session to Puter FS:', fsErr?.message ?? fsErr);
      }

      setFeedback({ message: summary, severity: 'green' });
    } catch (err) {
      // Surface the real error message for debugging
      const errMsg = err?.message ?? err?.error ?? JSON.stringify(err) ?? 'Unknown error';
      console.error('Post-session AI error:', errMsg, err);
      setFeedback({ message: 'Session complete! (AI summary unavailable)', severity: 'yellow' });
    }
  };

  return { startEngine, stopEngine, isRunning, metrics, feedback };
};
