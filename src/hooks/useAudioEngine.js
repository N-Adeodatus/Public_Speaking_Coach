import { useState, useRef, useEffect, useCallback } from 'react';
import { EventEngine } from '../lib/EventEngine';

export const useAudioEngine = (graphRef) => {
  const [isRunning, setIsRunning] = useState(false);
  const [metrics, setMetrics] = useState({ f0: 0, cv: null, rms: 0, isVoiced: false });
  const [feedback, setFeedback] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const audioCtxRef     = useRef(null);
  const workletNodeRef  = useRef(null);
  const streamRef       = useRef(null);

  const eventEngineRef = useRef(new EventEngine());

  // Tier 1.5 & Tier 2: message buffer + phrase accumulator
  const messageBufferRef      = useRef([]);
  const lastStateUpdateRef    = useRef(0);
  const phraseAccumulatorRef  = useRef({ f0s: [], rmsVals: [], lastVoicedTime: 0 });
  const sessionHistoryRef     = useRef([]);
  const sessionStartRef       = useRef(null);

  // Session-wide running stats for rich AI prompt
  const sessionStatsRef = useRef({ cvSamples: [], rmsSamples: [], voicedFrames: 0, totalFrames: 0 });
  const lastCvRef       = useRef(null);

  // ── Pause detection refs ─────────────────────────────────────────────────────
  const pauseLogRef                   = useRef([]); // { durationMs, category, precedingPhraseDurationMs, sessionOffsetSec, nearbyTranscript }
  const lastSegmentEndMsRef           = useRef(null);
  const lastSegmentEndOffsetSecRef    = useRef(0);
  const lastSegmentDurationMsRef      = useRef(0);
  const prevIsVoicedRef               = useRef(false);

  // Track the active speaking window (first voice → last voice)
  const firstVoicedMsRef = useRef(null);
  const lastVoicedMsRef  = useRef(null);

  // ── Transcript refs (Web Speech API) ────────────────────────────────────────
  const transcriptChunksRef = useRef([]); // { text: string, offsetSec: number }
  const recognizerRef       = useRef(null);

  // ── Helper: find 1-2 nearest transcript chunks before a pause ───────────────
  const getNearbyTranscript = (pauseOffsetSec) => {
    const chunks = transcriptChunksRef.current;
    const before = chunks.filter(c => c.offsetSec <= pauseOffsetSec + 1.5);
    if (!before.length) return null;
    const recent = before.slice(-2).map(c => c.text).join(' ');
    const words  = recent.trim().split(/\s+/);
    return (words.length > 10 ? '...' + words.slice(-10).join(' ') : recent).trim() || null;
  };

  // ── processBuffer — runs every 50ms ─────────────────────────────────────────
  const processBuffer = useCallback(() => {
    const messages = messageBufferRef.current;
    if (messages.length === 0) return;

    const latest = messages[messages.length - 1];

    for (const msg of messages) {
      // Graph path (no React re-render)
      if (graphRef.current) {
        graphRef.current.pushData(msg.f0, msg.rms, msg.isVoiced, lastCvRef.current);
      }

      // Session stats accumulation
      const stats = sessionStatsRef.current;
      stats.totalFrames++;
      if (msg.isVoiced) {
        stats.voicedFrames++;
        const now = Date.now();
        if (firstVoicedMsRef.current === null) firstVoicedMsRef.current = now;
        lastVoicedMsRef.current = now;
      }
      if (typeof msg.rms === 'number') stats.rmsSamples.push(msg.rms);

      // ── Phrase accumulation + rolling CV ────────────────────────────────────
      if (msg.isVoiced) {
        phraseAccumulatorRef.current.f0s.push(msg.f0);
        phraseAccumulatorRef.current.rmsVals.push(msg.rms);
        phraseAccumulatorRef.current.lastVoicedTime = performance.now();

        // Rolling CV so the graph stays alive during speech
        const validF0s = phraseAccumulatorRef.current.f0s.filter(v => v > 50);
        if (validF0s.length >= 5) {
          const sorted   = [...validF0s].sort((a, b) => a - b);
          const med      = sorted[Math.floor(sorted.length / 2)];
          const absDev   = validF0s.map(v => Math.abs(v - med)).sort((a, b) => a - b);
          const mad      = absDev[Math.floor(absDev.length / 2)];
          lastCvRef.current = (mad * 1.4826) / med;
        }
      } else {
        const timeSinceVoiced = performance.now() - (phraseAccumulatorRef.current.lastVoicedTime || performance.now());
        if (timeSinceVoiced > 800) {
          if (phraseAccumulatorRef.current.f0s.length > 10) {
            const result = eventEngineRef.current.processPhrase(phraseAccumulatorRef.current);
            if (result?.event?.features?.pitchCV != null) {
              stats.cvSamples.push(result.event.features.pitchCV);
              lastCvRef.current = result.event.features.pitchCV;
            }
            if (result?.event)    sessionHistoryRef.current.push(result.event);
            if (result?.feedback) setFeedback(result.feedback);
          }
          phraseAccumulatorRef.current = { f0s: [], rmsVals: [], lastVoicedTime: 0 };
        }
      }

      // ── Pause detection: voice state transitions ─────────────────────────────
      if (!msg.isVoiced && prevIsVoicedRef.current) {
        // Voiced → Silent: record when this segment ended
        lastSegmentEndMsRef.current        = Date.now();
        lastSegmentEndOffsetSecRef.current = parseFloat(((Date.now() - (sessionStartRef.current || Date.now())) / 1000).toFixed(1));
        if (msg.segmentDurationMs > 0) lastSegmentDurationMsRef.current = msg.segmentDurationMs;
      }

      if (msg.isVoiced && !prevIsVoicedRef.current && lastSegmentEndMsRef.current !== null) {
        // Silent → Voiced: measure the gap
        const gapMs = Date.now() - lastSegmentEndMsRef.current;
        if (gapMs > 250) {
          const cat     = gapMs < 500 ? 'micro' : gapMs < 1500 ? 'short' : gapMs < 4000 ? 'long' : 'very_long';
          const pOffset = lastSegmentEndOffsetSecRef.current;
          pauseLogRef.current.push({
            durationMs:              Math.round(gapMs),
            category:                cat,
            precedingPhraseDurationMs: Math.round(lastSegmentDurationMsRef.current),
            sessionOffsetSec:        pOffset,
            nearbyTranscript:        getNearbyTranscript(pOffset),
          });
        }
        lastSegmentEndMsRef.current = null;
      }

      prevIsVoicedRef.current = msg.isVoiced;
    }

    // Throttled UI state update ~5 Hz
    const now = performance.now();
    if (now - lastStateUpdateRef.current > 200) {
      setMetrics({
        f0:       latest.f0,
        cv:       lastCvRef.current,
        rms:      latest.rms,
        isVoiced: latest.isVoiced,
      });
      lastStateUpdateRef.current = now;
    }

    messageBufferRef.current = [];
  }, [graphRef]);

  // Flush interval
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(processBuffer, 50);
    return () => clearInterval(interval);
  }, [isRunning, processBuffer]);

  // ── startEngine ──────────────────────────────────────────────────────────────
  const startEngine = async () => {
    try {
      setFeedback({ message: 'Loading Engine...', severity: 'yellow' });

      // Reset all session state
      sessionHistoryRef.current     = [];
      sessionStartRef.current       = Date.now();
      sessionStatsRef.current       = { cvSamples: [], rmsSamples: [], voicedFrames: 0, totalFrames: 0 };
      lastCvRef.current             = null;
      pauseLogRef.current           = [];
      lastSegmentEndMsRef.current   = null;
      lastSegmentEndOffsetSecRef.current = 0;
      lastSegmentDurationMsRef.current   = 0;
      prevIsVoicedRef.current       = false;
      firstVoicedMsRef.current      = null;
      lastVoicedMsRef.current       = null;
      transcriptChunksRef.current   = [];
      eventEngineRef.current.resetSession();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const actx = new AudioContext();
      audioCtxRef.current = actx;

      await actx.audioWorklet.addModule('/essentia_worklet.js');
      const node = new AudioWorkletNode(actx, 'coach-processor');
      workletNodeRef.current = node;

      node.port.onmessage = (e) => {
        if (e.data.type === 'METRICS') messageBufferRef.current.push(e.data);
      };

      const source = actx.createMediaStreamSource(stream);
      source.connect(node);

      // ── Start Web Speech API transcript (Chromium only) ──────────────────────
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        try {
          const rec = new SR();
          rec.continuous      = true;
          rec.interimResults  = false;
          rec.lang            = 'en-US';
          rec.onresult = (e) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) {
                const offsetSec = parseFloat(((Date.now() - sessionStartRef.current) / 1000).toFixed(1));
                transcriptChunksRef.current.push({
                  text: e.results[i][0].transcript.trim(),
                  offsetSec,
                });
              }
            }
          };
          rec.onerror = (e) => console.warn('SpeechRecognition error:', e.error);
          rec.start();
          recognizerRef.current = rec;
        } catch (srErr) {
          console.warn('SpeechRecognition could not start:', srErr.message);
        }
      }

      setIsRunning(true);
      setFeedback({ message: 'Running... Ready to coach!', severity: 'green' });
    } catch (err) {
      console.error(err);
      setFeedback({ message: `Error: ${err.message}`, severity: 'red' });
    }
  };

  // ── stopEngine ───────────────────────────────────────────────────────────────
  const stopEngine = async () => {
    // Stop audio
    if (streamRef.current)    streamRef.current.getTracks().forEach(t => t.stop());
    if (workletNodeRef.current) workletNodeRef.current.disconnect();
    if (audioCtxRef.current)  await audioCtxRef.current.close();
    audioCtxRef.current   = null;
    workletNodeRef.current = null;
    streamRef.current     = null;

    // Stop recognizer
    if (recognizerRef.current) {
      try { recognizerRef.current.stop(); } catch (_) {}
      recognizerRef.current = null;
    }

    setIsRunning(false);

    const events = sessionHistoryRef.current;

    // Use the active speaking window (first→last voiced frame) as the effective duration.
    // This excludes pre-speech silence (user hasn't started yet) and
    // post-speech silence (user forgot to stop recording).
    const effectiveStartMs = firstVoicedMsRef.current ?? sessionStartRef.current;
    const effectiveEndMs   = lastVoicedMsRef.current  ?? Date.now();
    const durationSec      = Math.max(1, Math.round((effectiveEndMs - effectiveStartMs) / 1000));

    setFeedback({ message: '⏳ Analyzing session with AI...', severity: 'yellow' });

    try {
      if (!puter.auth.isSignedIn()) {
        setFeedback({ message: 'Session complete! Sign in to unlock AI summaries.', severity: 'yellow' });
        return;
      }

      // ── Section 1: session overview stats ─────────────────────────────────
      const stats     = sessionStatsRef.current;
      const avgCV     = stats.cvSamples.length > 0
        ? (stats.cvSamples.reduce((a, b) => a + b, 0) / stats.cvSamples.length).toFixed(3)
        : 'N/A';
      const avgRMS    = stats.rmsSamples.length > 0
        ? (stats.rmsSamples.reduce((a, b) => a + b, 0) / stats.rmsSamples.length).toFixed(4)
        : 'N/A';
      // voicedPct: voiced frames relative to the effective speaking window
      const effectiveWindowMs = effectiveEndMs - effectiveStartMs;
      const voicedPct = effectiveWindowMs > 0
        ? Math.round((stats.voicedFrames * 100) / (effectiveWindowMs / 100))
        : 0;

      // ── Section 2: pitch evidence ──────────────────────────────────────────
      const cvGuide = avgCV === 'N/A' ? '' : (() => {
        const v = parseFloat(avgCV);
        if (v < 0.08)  return 'very low variance — delivery sounded quite monotone.';
        if (v < 0.12)  return 'below-average variance — delivery was somewhat flat.';
        if (v <= 0.20) return 'healthy variance — good natural expressiveness.';
        return 'high variance — very expressive and dynamic.';
      })();

      const namedEvents = events.filter(ev => ev.type !== 'normal_phrase' && ev.confidence != null);
      const allPhrases  = events.filter(ev => ev.evidence);

      const evidenceSlices = namedEvents.map((ev, i) => {
        const e = ev.evidence;
        const offset    = e.sessionOffsetSec != null ? `~${e.sessionOffsetSec}s` : `phrase ${i + 1}`;
        const pitchDesc = e.pitchTrend === 'flat'
          ? `pitch narrow (${e.pitchMin}–${e.pitchMax} Hz, CV ${e.pitchCV})`
          : `pitch ${e.pitchTrend} (${e.pitchMin}→${e.pitchMax} Hz)`;
        return `  • [${offset}, ${e.durationSec}s] ${ev.type.replace(/_/g, ' ')}: ${pitchDesc}, volume ${e.rmsTrend} (RMS ${e.rmsAvg})`;
      }).join('\n');

      const normalSnapshots = allPhrases
        .filter(ev => ev.type === 'normal_phrase')
        .slice(0, 3)
        .map(ev => {
          const e = ev.evidence;
          return `  • [~${e.sessionOffsetSec}s] Normal: pitch ${e.pitchTrend}, ${e.pitchMin}–${e.pitchMax} Hz, RMS ${e.rmsAvg} (${e.rmsTrend})`;
        }).join('\n');

      // ── Section 3: pause stats + concrete examples ─────────────────────────
      const pauses = pauseLogRef.current;
      const pauseSection = (() => {
        if (pauses.length === 0) return '(No significant pauses detected in this session.)';

        const avgPauseMs = Math.round(pauses.reduce((a, b) => a + b.durationMs, 0) / pauses.length);
        const dist = {
          micro:     pauses.filter(p => p.category === 'micro').length,
          short:     pauses.filter(p => p.category === 'short').length,
          long:      pauses.filter(p => p.category === 'long').length,
          very_long: pauses.filter(p => p.category === 'very_long').length,
        };

        const topPauses = [...pauses]
          .sort((a, b) => b.durationMs - a.durationMs)
          .slice(0, 5);

        const examples = topPauses.map(p => {
          const nearby = p.nearbyTranscript ? ` | nearby speech: "...${p.nearbyTranscript}"` : '';
          return `  • ~${p.sessionOffsetSec}s: ${(p.durationMs / 1000).toFixed(1)}s pause | preceded ${(p.precedingPhraseDurationMs / 1000).toFixed(1)}s of speech${nearby}`;
        }).join('\n');

        return `Total: ${pauses.length} | Avg: ${avgPauseMs}ms
Distribution: micro(<500ms): ${dist.micro} | short(500–1500ms): ${dist.short} | long(1500–4s): ${dist.long} | very long(>4s): ${dist.very_long}

Most notable pauses (longest first):
${examples}

Note: Timing is approximate (±1s). Preceding phrase duration is a timing proxy only — a short phrase can be a complete thought and a long one can be unfinished. Do not assume pause quality from duration alone.`;
      })();

      // ── Section 4: transcript + filler analysis ────────────────────────────
      const transcriptChunks    = transcriptChunksRef.current;
      const transcriptAvailable = transcriptChunks.length > 0;
      const transcriptSection   = transcriptAvailable
        ? `Full session transcript (en-US, browser STT — may contain recognition errors):
${transcriptChunks.map(c => `[~${c.offsetSec}s] ${c.text}`).join(' | ')}

Do not count exact filler occurrences — STT recognition is imperfect. Instead, assess the overall pattern: does filler usage appear frequent, occasional, or minimal? Cite 1 example sentence if a clear filler is evident. Hedge your wording: use "appears to" or "the transcript suggests".`
        : '(Transcript unavailable — filler and alignment analysis skipped for this session.)';

      // ── Certainty note ─────────────────────────────────────────────────────
      const certaintyNote = durationSec < 45
        ? `NOTE: Short sample (${durationSec}s). Treat observations as early signals, not definitive diagnosis.`
        : `Session length (${durationSec}s) is sufficient for moderate confidence in these observations.`;

      // ── Final structured prompt ────────────────────────────────────────────
      const prompt = `You are a professional public speaking coach. Analyze this session data and produce a coaching response.

${certaintyNote}

━━ SECTION 1 of 4 — SESSION OVERVIEW ━━
Duration: ${durationSec}s | Speaking ratio: ${voicedPct}% | Avg loudness: ${avgRMS} RMS

━━ SECTION 2 of 4 — PITCH & EXPRESSIVENESS ━━
Avg pitch CV: ${avgCV} (${cvGuide})
Phrase evidence:
${evidenceSlices || '  (no named events detected)'}
Normal phrase samples:
${normalSnapshots || '  (not enough phrases logged)'}

━━ SECTION 3 of 4 — PAUSE BEHAVIOUR ━━
${pauseSection}

━━ SECTION 4 of 4 — FLUENCY / FILLER WORDS ━━
${transcriptSection}

━━ INSTRUCTION ━━
Write ONE coaching response of 5–6 sentences. Cover all 4 sections proportionally.
Reference 2–3 SPECIFIC timestamped moments from the data above.
When relevant, connect signals across sections (e.g., hesitation pauses that coincide with filler usage, or long pauses following monotone segments).
Be precise and actionable. Avoid vague encouragement. The learner is trying to improve.`;

      const response = await puter.ai.chat(prompt, { model: 'anthropic/claude-sonnet-4-6' });

      // Parse Puter AI response (handles string or structured object)
      let summary = 'Great session!';
      if (typeof response === 'string') {
        summary = response;
      } else if (response?.message?.content?.[0]?.text) {
        summary = response.message.content[0].text;
      } else if (typeof response?.toString === 'function') {
        const str = response.toString();
        if (str !== '[object Object]') summary = str;
      }

      // Save session log to Puter FS.
      // Relative paths (no leading slash) resolve to the user's home directory —
      // the folder will appear alongside Documents, Desktop, etc. in the Puter file browser.
      try {
        const SESSION_DIR = 'ps-coach-sessions';

        // Create the directory — only swallow "already exists" errors
        try {
          await puter.fs.mkdir(SESSION_DIR);
        } catch (mkdirErr) {
          const msg  = (mkdirErr?.message ?? '').toLowerCase();
          const code = (mkdirErr?.code    ?? '').toLowerCase();
          const alreadyExists = msg.includes('exist') || code.includes('exist') || code.includes('conflict');
          if (!alreadyExists) {
            throw mkdirErr; // surface real errors
          }
        }

        const timestamp  = new Date().toISOString().replace(/[:.]/g, '-');
        const sessionLog = JSON.stringify({
          timestamp, durationSec, events,
          pauses: pauseLogRef.current,
          transcript: transcriptChunks,
        }, null, 2);

        const filePath = `${SESSION_DIR}/session-${timestamp}.json`;
        await puter.fs.write(filePath, JSON.stringify({
          timestamp, durationSec, events,
          pauses: pauseLogRef.current,
          transcript: transcriptChunks,
          aiSummary: summary,           // ← persist the coaching summary
        }, null, 2));
        console.log('✅ Session saved to Puter FS:', filePath);
        setRefreshTrigger(prev => prev + 1); // trigger SessionHistory reload
      } catch (fsErr) {
        console.warn('Could not save session to Puter FS:', fsErr?.message ?? fsErr, fsErr);
      }

      setFeedback({ message: summary, severity: 'green' });
    } catch (err) {
      const errMsg = err?.message ?? err?.error ?? JSON.stringify(err) ?? 'Unknown error';
      console.error('Post-session AI error:', errMsg, err);
      setFeedback({ message: 'Session complete! (AI summary unavailable)', severity: 'yellow' });
    }
  };

  return { startEngine, stopEngine, isRunning, metrics, feedback, refreshTrigger };
};
