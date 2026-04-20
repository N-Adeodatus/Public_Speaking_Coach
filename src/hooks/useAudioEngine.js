import { useState, useRef, useEffect, useCallback } from 'react';
import { EventEngine } from '../lib/EventEngine';

// ─── Phrase Anchor Lookup ─────────────────────────────────────────────────────
// Implements the Level 3 → Level 2 → Level 1 fallback hierarchy:
//   L3: phrase excerpt + timestamp   (high-confidence STT match)
//   L2: structural position + timestamp (always available from pitch trend)
//   L1: timestamp only               (last resort)
//
// Safeguards:
//   - MIN_CONFIDENCE: reject low-quality STT results (trust damage = hallucination)
//   - MIN_WORDS / MAX_WORDS: reject fragments and cap excerpt length
//   - MATCH_WINDOW: ±1s tolerance for DSP/STT timing drift
//   - Closest-centroid tie-breaking: pick best match, not first match
const STT_CONFIG = {
  MIN_CONFIDENCE: 0.75,  // below this, STT errors are too likely
  MIN_WORDS: 3,          // reject ultra-short fragments ("uh", "the", "okay")
  MAX_WORDS: 6,          // cap excerpt to prevent long noisy dumps
  MATCH_WINDOW: 1.0,     // ±seconds to search around the phrase offset
};

function findPhraseAnchor(sessionOffsetSec, transcriptLog) {
  if (!transcriptLog || transcriptLog.length === 0) return null;

  const { MIN_CONFIDENCE, MIN_WORDS, MAX_WORDS, MATCH_WINDOW } = STT_CONFIG;

  // 1. Find candidates whose time window overlaps within tolerance
  const candidates = transcriptLog.filter(entry => {
    const withinWindow =
      entry.startSec <= sessionOffsetSec + MATCH_WINDOW &&
      entry.endSec   >= sessionOffsetSec - MATCH_WINDOW;
    const confOk = entry.confidence === 0   // Chrome omits confidence for some results — treat 0 as unset, not bad
      ? entry.text.split(/\s+/).length >= MIN_WORDS  // fall back to length heuristic
      : entry.confidence >= MIN_CONFIDENCE;
    return withinWindow && confOk;
  });

  if (candidates.length === 0) return null;

  // 2. Pick entry whose midpoint is closest to the phrase offset
  const best = candidates.reduce((a, b) => {
    const aMid = (a.startSec + a.endSec) / 2;
    const bMid = (b.startSec + b.endSec) / 2;
    return Math.abs(aMid - sessionOffsetSec) <= Math.abs(bMid - sessionOffsetSec) ? a : b;
  });

  // 3. Quality filter: enough real words?
  const words = best.text.trim().split(/\s+/).filter(w => w.length > 1);
  if (words.length < MIN_WORDS) return null;

  // 4. Extract a short excerpt (prefer words from the middle of the phrase
  //    since that's where the acoustic event most often peaks)
  const start = words.length > MAX_WORDS
    ? Math.max(0, Math.floor(words.length / 2) - Math.floor(MAX_WORDS / 2))
    : 0;
  const excerpt = words.slice(start, start + MAX_WORDS).join(' ');

  return excerpt;
}

// Structural position cue derived from pitch trend (Level 2 fallback)
function structuralCue(pitchTrend) {
  if (pitchTrend === 'falling') return 'toward the end of a phrase';
  if (pitchTrend === 'rising')  return 'building through a phrase';
  return 'throughout a phrase';
}
// ─────────────────────────────────────────────────────────────────────────────

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
  const lastCvRef = useRef(null);

  // Web Speech API for phrase anchoring (Level 3 UX)
  const recognitionRef   = useRef(null);
  const transcriptLogRef = useRef([]); // [{text, startSec, endSec, confidence}]

  const processBuffer = useCallback(() => {
    const messages = messageBufferRef.current;
    if (messages.length === 0) return;

    // We process the latest state for UI, but push all frames to the graph
    const latest = messages[messages.length - 1];

    for (const msg of messages) {
      if (graphRef.current) {
        graphRef.current.pushData(msg.f0, msg.rms, msg.isVoiced, lastCvRef.current);
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
        
        // Calculate rolling CV for a more alive graph
        const f0s = phraseAccumulatorRef.current.f0s;
        const validF0s = f0s.filter(v => v > 50);
        if (validF0s.length >= 5) {
          const sortedF0 = [...validF0s].sort((a,b) => a - b);
          const medianF0 = sortedF0[Math.floor(sortedF0.length / 2)];
          const absDev = validF0s.map(v => Math.abs(v - medianF0)).sort((a,b) => a - b);
          const mad = absDev[Math.floor(absDev.length / 2)];
          lastCvRef.current = (mad * 1.4826) / medianF0;
        }
      } else {
        const timeSinceVoiced = performance.now() - (phraseAccumulatorRef.current.lastVoicedTime || performance.now());
        if (timeSinceVoiced > 800) {
          if (phraseAccumulatorRef.current.f0s.length > 10) {
              const result = eventEngineRef.current.processPhrase(phraseAccumulatorRef.current);
              // Accumulate per-phrase CV for the session stat
              if (result?.event?.features?.pitchCV != null) {
                stats.cvSamples.push(result.event.features.pitchCV);
                lastCvRef.current = result.event.features.pitchCV;
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
        cv: lastCvRef.current, // stored from phrase processing
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
      lastCvRef.current = null;
      transcriptLogRef.current = [];
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

      // ── Web Speech API (Level 3 phrase anchoring) ──────────────────────────
      // Runs in the main thread in parallel with the AudioWorklet DSP.
      // Only Chromium-based browsers support this; silently skipped elsewhere.
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const recognition = new SR();
        recognition.continuous     = true;
        recognition.interimResults = false; // only commit final results to avoid re-alignment issues
        recognition.lang           = 'en-US';

        recognition.onresult = (event) => {
          const result = event.results[event.results.length - 1];
          if (!result.isFinal || !sessionStartRef.current) return;

          const text       = result[0].transcript.trim();
          const confidence = result[0].confidence ?? 0; // Chrome omits for some grammars
          const endSec     = (Date.now() - sessionStartRef.current) / 1000;
          // Estimate start: rough speaking rate ~2.5 words/sec
          const wordCount  = text.split(/\s+/).length;
          const startSec   = Math.max(0, endSec - Math.max(0.5, wordCount / 2.5));

          transcriptLogRef.current.push({ text, startSec, endSec, confidence });
        };

        recognition.onerror = (e) => {
          // 'no-speech' is normal during silence — suppress it
          if (e.error !== 'no-speech') console.warn('[STT]', e.error);
        };

        // Auto-restart: SpeechRecognition stops after long silences;
        // we want continuous coverage for the full session
        recognition.onend = () => {
          if (recognitionRef.current === recognition && audioCtxRef.current) {
            try { recognition.start(); } catch (_) { /* already stopped */ }
          }
        };

        try {
          recognition.start();
          recognitionRef.current = recognition;
        } catch (sttErr) {
          console.warn('[STT] Could not start SpeechRecognition:', sttErr.message);
        }
      }
      // ── end STT ────────────────────────────────────────────────────────────
    } catch (err) {
      console.error(err);
      setFeedback({ message: `Error: ${err.message}`, severity: "red" });
    }
  };

  const stopEngine = async () => {
    // Stop STT first so its onend doesn't try to restart after AudioContext closes
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // disarm auto-restart
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }

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
      // Labels are deliberately conservative to avoid overclaiming (see calibration notes)
      const cvGuide = avgCV === 'N/A' ? '' : (() => {
        const v = parseFloat(avgCV);
        if (v < 0.08) return 'This is a very low pitch variance — delivery was acoustically quite flat in this session.';
        if (v < 0.12) return 'This is below-average pitch variance — delivery showed limited pitch movement in this session.';
        if (v <= 0.20) return 'This is a healthy pitch variance — delivery showed good natural pitch expressiveness in this session.';
        return 'This is high pitch variance — delivery was acoustically very dynamic in this session.';
      })();

      // Build moment-first evidence slices (sorted by session time)
      const namedEvents = events.filter(ev => ev.type !== 'normal_phrase' && ev.confidence != null);
      const allPhrases  = events.filter(ev => ev.evidence); // all logged phrases for context

      // Format each named event as a time-anchored micro-summary.
      // Location reference uses a 3-tier fallback:
      //   L3 (best):   phrase excerpt + timestamp  (STT matched, high confidence)
      //   L2 (safe):   structural position + timestamp (derived from pitch trend)
      //   L1 (last):   timestamp only
      const evidenceSlices = namedEvents.map((ev, i) => {
        const e = ev.evidence;
        const tSec = e.sessionOffsetSec;

        // ── Location reference (L3 → L2 → L1) ──
        let locationRef;
        const phraseAnchor = tSec != null
          ? findPhraseAnchor(tSec, transcriptLogRef.current)
          : null;

        if (phraseAnchor && tSec != null) {
          // Level 3: phrase excerpt + timestamp. "(approx.)" signals to the user
          // that this is STT output, not a perfect transcription.
          locationRef = `when you said (approx.) "${phraseAnchor}" (~${tSec}s)`;
        } else if (tSec != null) {
          // Level 2: structural cue derived from the pitch trend direction
          locationRef = `${structuralCue(e.pitchTrend)} around ${tSec}s`;
        } else {
          // Level 1: timestamp only
          locationRef = `phrase ${i + 1}`;
        }

        const pitchDesc = e.pitchTrend === 'flat'
          ? `pitch stayed narrow (${e.pitchMin}–${e.pitchMax} Hz, CV ${e.pitchCV})`
          : `pitch was ${e.pitchTrend} (${e.pitchMin}→${e.pitchMax} Hz)`;
        const rmsDesc = `volume was ${e.rmsTrend} (avg RMS ${e.rmsAvg})`;
        return `• [${locationRef}, ${e.durationSec}s phrase] ${ev.type.replace(/_/g,' ')}: ${pitchDesc}, ${rmsDesc}`;
      }).join('\n');

      // Normal phrase snapshots for context (show up to 3), also with fallback
      const normalSnapshots = allPhrases
        .filter(ev => ev.type === 'normal_phrase')
        .slice(0, 3)
        .map((ev) => {
          const e = ev.evidence;
          const tSec = e.sessionOffsetSec;
          const anchor = tSec != null ? findPhraseAnchor(tSec, transcriptLogRef.current) : null;
          const loc = anchor && tSec != null
            ? `when you said (approx.) "${anchor}" (~${tSec}s)`
            : tSec != null
              ? `${structuralCue(e.pitchTrend)} around ${tSec}s`
              : 'a phrase';
          return `• [${loc}] Normal phrase: pitch ${e.pitchTrend}, ${e.pitchMin}–${e.pitchMax} Hz, RMS ${e.rmsAvg} (${e.rmsTrend})`;
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

CRITICAL GUARDRAILS — violating any of these degrades product quality:
- UNCERTAINTY: Frame all observations as specific to this session (e.g. "in this recording", "in this sample"). Never present acoustic patterns as permanent traits. Use "often" instead of "always" when generalising from this short sample.
- NO PSYCHOLOGICAL INFERENCE: Do NOT claim what listeners feel or experience (e.g. no "listeners perceive this as low urgency"). Stick to what the acoustic data shows.
- NO CAUSE SPECULATION: Do NOT guess WHY the speaker speaks a certain way (e.g. no "likely due to nervousness"). You don't have that data.
- LABEL CALIBRATION: Match your language to the CV thresholds. If CV is 0.08–0.12, say "limited pitch movement" or "relatively flat" — never "monotone".
- NORM COMPARISON: If comparing to typical range, say "on the lower end of typical conversational variation" — not "below normal".
- MEASUREMENT HUMILITY: Prefix acoustic observations with "based on detected pitch patterns" at least once to signal that measurements have natural limits.
- PHRASE ANCHORS: Where evidence includes "(approx.)" phrase text, reference it to help the user locate the moment. Do NOT over-interpret individual words — the text is an approximate STT transcript, not a verbatim quote.
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

      // Save compressed session log to Puter FS under ps-coach-sessions folder
      try {
        try {
          await puter.fs.mkdir('ps-coach-sessions');
        } catch (dirErr) {
          // Ignore error if folder already exists
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sessionLog = JSON.stringify({ timestamp, durationSec, events }, null, 2);
        await puter.fs.write(`ps-coach-sessions/session-${timestamp}.json`, sessionLog);
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
