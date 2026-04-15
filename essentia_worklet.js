// PS Coach -- Audio Analysis AudioWorklet Processor
// Pure-JS DSP: autocorrelation pitch detection + RMS loudness
// No WASM dependency — reliable, zero-latency startup.

class CoachProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Config
    this.frameSize   = 2048; // larger frame = better pitch accuracy
    this.sampleRate  = sampleRate; // global provided by AudioWorkletGlobalScope

    // Ring-buffer to accumulate samples up to frameSize
    this.buffer      = new Float32Array(this.frameSize);
    this.bufferIndex = 0;

    // Pitch filtering state
    this.prevF0   = 0;
    this.f0Window = []; // rolling window for CV calculation

    // Calibration
    this.calibrating         = false;
    this.calibrationRmsBuf   = [];
    this.silenceThreshold    = 0.005; // sensible default until calibrated

    // VAD state
    this.voicedRunMs  = 0;
    this.silenceRunMs = 0;
    this.isVoiced     = false;

    // Segment tracking for sentence-drop detection
    this.segmentRms    = [];
    this.segmentFrames = 0;

    // Throttle postMessage to ~10× per second
    this.framesSincePost  = 0;
    this.postEveryFrames  = Math.round(this.sampleRate * 0.1 / 128); // 128 = WebAudio render quantum

    this.port.onmessage = this.onMessage.bind(this);
  }

  // ── Message handler ─────────────────────────────────────────────────────────
  onMessage(e) {
    if (e.data.type === 'START_CALIBRATION') {
      this.calibrating       = true;
      this.calibrationRmsBuf = [];
    } else if (e.data.type === 'FINISH_CALIBRATION') {
      this.calibrating = false;
      if (this.calibrationRmsBuf.length === 0) return;

      const mean = avg(this.calibrationRmsBuf);
      const sd   = stdDev(this.calibrationRmsBuf, mean);
      this.silenceThreshold = Math.max(mean * 0.3, 0.003); // never set absurdly low

      this.port.postMessage({ type: 'CALIBRATION_DONE', meanRms: mean, stdDevRms: sd, threshold: this.silenceThreshold });
    }
  }

  // ── WebAudio render callback ─────────────────────────────────────────────────
  process(inputs) {
    const ch = inputs?.[0]?.[0];
    if (!ch) return true;

    // Accumulate 128-sample quanta into our larger analysis buffer
    for (let i = 0; i < ch.length; i++) {
      this.buffer[this.bufferIndex++] = ch[i];

      if (this.bufferIndex >= this.frameSize) {
        this.analyseFrame();
        // 50% overlap hop
        this.buffer.copyWithin(0, this.frameSize / 2);
        this.bufferIndex = this.frameSize / 2;
      }
    }

    this.framesSincePost++;
    return true;
  }

  // ── Frame analysis ───────────────────────────────────────────────────────────
  analyseFrame() {
    const buf = this.buffer;

    // 1. RMS
    let sumSq = 0;
    for (let i = 0; i < this.frameSize; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / this.frameSize);

    // Calibration mode: just collect RMS samples
    if (this.calibrating) {
      this.calibrationRmsBuf.push(rms);
      return;
    }

    // 2. Pitch (autocorrelation)
    const rawF0 = this.autocorrPitch(buf);

    // 3. Pitch filtering chain
    let f0 = 0;
    if (rawF0 >= 70 && rawF0 <= 400) {
      // Octave-jump rejection
      if (this.prevF0 === 0 || (rawF0 <= this.prevF0 * 1.8 && rawF0 >= this.prevF0 * 0.55)) {
        f0 = rawF0;
        this.prevF0 = f0;
      }
    } else {
      this.prevF0 = 0;
    }

    // Median smooth
    if (f0 > 0) {
      this.f0Window.push(f0);
      if (this.f0Window.length > 5) this.f0Window.shift();
    } else {
      this.f0Window = [];
    }
    const smoothF0 = median(this.f0Window);

    // 4. VAD
    const hasPower = rms > this.silenceThreshold;
    const hasPitch = smoothF0 > 0;
    const blockMs  = (this.frameSize / 2 / this.sampleRate) * 1000; // hop duration

    if (hasPower && hasPitch) {
      this.voicedRunMs  += blockMs;
      this.silenceRunMs  = 0;
    } else if (hasPower && this.voicedRunMs > 200) {
      // Whisper fallback: sustained power without pitch
      this.voicedRunMs  += blockMs;
      this.silenceRunMs  = 0;
    } else {
      this.silenceRunMs += blockMs;
      if (this.silenceRunMs >= 250) this.voicedRunMs = 0;
    }

    const nowVoiced = this.voicedRunMs > 0;
    let segmentEnded = false;
    let sentenceDrop = false;

    if (nowVoiced !== this.isVoiced) {
      if (!nowVoiced) {
        // Voiced run ended — evaluate sentence drop
        segmentEnded = true;
        const segMs = this.segmentFrames * blockMs;
        if (segMs >= 500 && this.segmentRms.length >= 4) {
          const arr       = this.segmentRms;
          const mid       = Math.floor(arr.length * 0.5);
          const last25    = Math.floor(arr.length * 0.75);
          const firstMean = avg(arr.slice(0, mid));
          const lastMean  = avg(arr.slice(last25));
          if (lastMean < firstMean * 0.65) sentenceDrop = true;
        }
        this.segmentRms    = [];
        this.segmentFrames = 0;
      }
      this.isVoiced = nowVoiced;
    }

    if (this.isVoiced) {
      this.segmentRms.push(rms);
      this.segmentFrames++;
    }

    // 5. Post metrics at ~10 Hz or on segment events
    if (this.framesSincePost >= this.postEveryFrames || segmentEnded) {
      this.port.postMessage({
        type: 'METRICS',
        rms,
        f0: smoothF0,
        isVoiced: this.isVoiced,
        segmentEnded,
        sentenceDrop,
      });
      this.framesSincePost = 0;
    }
  }

  // ── Autocorrelation pitch detector ──────────────────────────────────────────
  autocorrPitch(buf) {
    const n    = buf.length;
    const half = Math.floor(n / 2);

    // RMS gate — don't attempt pitch on silence
    let rms = 0;
    for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
    if (Math.sqrt(rms / n) < 0.003) return 0;

    // Autocorrelation
    const ac = new Float32Array(half);
    for (let lag = 0; lag < half; lag++) {
      let s = 0;
      for (let j = 0; j < half; j++) s += buf[j] * buf[j + lag];
      ac[lag] = s;
    }

    // Find first local minimum (end of initial drop)
    let d = 0;
    while (d < half - 1 && ac[d] > ac[d + 1]) d++;

    // Find first peak after that dip
    let maxVal = -Infinity, maxPos = -1;
    for (let i = d; i < half; i++) {
      if (ac[i] > maxVal) { maxVal = ac[i]; maxPos = i; }
    }

    if (maxPos < 1) return 0;

    // Parabolic interpolation for sub-sample accuracy
    const prev  = ac[maxPos - 1] ?? ac[maxPos];
    const next  = ac[maxPos + 1] ?? ac[maxPos];
    const denom = 2 * (2 * maxVal - prev - next);
    const refined = denom !== 0 ? maxPos + (prev - next) / denom : maxPos;

    // Confidence: ratio of peak to zero-lag
    const confidence = ac[0] > 0 ? maxVal / ac[0] : 0;
    if (confidence < 0.5) return 0;

    return this.sampleRate / refined;
  }
}

// ── Math helpers ─────────────────────────────────────────────────────────────
function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function stdDev(arr, mean) {
  if (!arr.length) return 0;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

registerProcessor('coach-processor', CoachProcessor);
