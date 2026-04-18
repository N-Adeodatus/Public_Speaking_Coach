export class EventEngine {
  constructor() {
    this.leakyBuckets = {
      monotone_segment: 0,
      trailing_off: 0,
      rushed_segment: 0
    };
    this.lastUpdateTime = performance.now();
    this.sessionStartTime = performance.now();
  }

  resetSession() {
    this.sessionStartTime = performance.now();
    for (const key in this.leakyBuckets) this.leakyBuckets[key] = 0;
  }

  processPhrase(phraseData) {
    const { f0s, rmsVals } = phraseData;
    const now = performance.now();
    const deltaTimeSec = Math.max(0.1, (now - this.lastUpdateTime) / 1000);
    this.lastUpdateTime = now;

    if (f0s.length < 5) return null;

    // --- Tier 2: Temporal Median & MAD smoothing ---
    const validF0s = f0s.filter(v => v > 50);

    let cv = 0;
    let medianF0 = 0;
    if (validF0s.length >= 5) {
      const sortedF0 = [...validF0s].sort((a,b) => a - b);
      medianF0 = sortedF0[Math.floor(sortedF0.length / 2)];

      const absDev = validF0s.map(v => Math.abs(v - medianF0)).sort((a,b) => a - b);
      const mad = absDev[Math.floor(absDev.length / 2)];
      cv = (mad * 1.4826) / medianF0;
    }

    // --- Evidence Slice: phrase-level micro data ---
    const durationSec = parseFloat((f0s.length * 0.1).toFixed(1));
    const sessionOffsetSec = parseFloat(((now - this.sessionStartTime) / 1000).toFixed(1));

    // Pitch trend: first half vs second half median
    const mid = Math.floor(validF0s.length / 2);
    const firstHalfF0  = validF0s.slice(0, mid);
    const secondHalfF0 = validF0s.slice(mid);
    const avgFirst  = firstHalfF0.length  ? firstHalfF0.reduce((a,b)  => a+b, 0) / firstHalfF0.length  : medianF0;
    const avgSecond = secondHalfF0.length ? secondHalfF0.reduce((a,b) => a+b, 0) / secondHalfF0.length : medianF0;
    const pitchDelta  = avgSecond - avgFirst;
    const pitchTrend  = pitchDelta > 8 ? 'rising' : pitchDelta < -8 ? 'falling' : 'flat';
    const voicedF0s   = validF0s;
    const pitchMin    = voicedF0s.length ? Math.round(Math.min(...voicedF0s)) : 0;
    const pitchMax    = voicedF0s.length ? Math.round(Math.max(...voicedF0s)) : 0;

    // RMS trend
    const firstHalfRms  = rmsVals.slice(0, mid);
    const secondHalfRms = rmsVals.slice(mid);
    const rmsFirst  = firstHalfRms.reduce((a,b)  => a+b, 0) / (firstHalfRms.length  || 1);
    const rmsSecond = secondHalfRms.reduce((a,b) => a+b, 0) / (secondHalfRms.length || 1);
    const rmsDelta  = (rmsSecond - rmsFirst) / (rmsFirst || 0.001);
    const rmsTrend  = rmsDelta < -0.15 ? 'declining' : rmsDelta > 0.15 ? 'increasing' : 'stable';
    const rmsAvg    = parseFloat((rmsVals.reduce((a,b) => a+b, 0) / rmsVals.length).toFixed(4));

    const evidence = {
      sessionOffsetSec,
      durationSec,
      pitchTrend,
      pitchMin,
      pitchMax,
      pitchRangeHz: pitchMax - pitchMin,
      pitchCV: parseFloat(cv.toFixed(3)),
      rmsTrend,
      rmsAvg,
    };

    // --- Tier 3: Event Classification ---
    let detectedEvent = null;

    if (cv > 0 && cv < 0.10) {
      const magnitude = Math.min(1, Math.max(0, (0.10 - cv) * 10));
      const duration   = Math.min(1, f0s.length / 50);
      const integrity  = 0.9;
      const confidence = (0.6 * magnitude + 0.25 * duration) * Math.max(0.4, Math.min(1.0, integrity));
      detectedEvent = { type: 'monotone_segment', confidence, features: { pitchCV: cv }, evidence };
    } else if (cv > 0.22) {
      detectedEvent = { type: 'emphasis_peak', confidence: 0.8, features: { pitchCV: cv }, evidence };
    } else if (rmsTrend === 'declining' && rmsSecond < 0.015) {
      detectedEvent = { type: 'trailing_off', confidence: 0.65, features: { pitchCV: cv }, evidence };
    } else {
      // Normal phrase: still log for the session summary
      detectedEvent = { type: 'normal_phrase', confidence: null, features: { pitchCV: cv }, evidence };
    }

    // --- Tier 4: Leaky Bucket Memory ---
    for (const key in this.leakyBuckets) {
      this.leakyBuckets[key] = Math.max(0, this.leakyBuckets[key] - (deltaTimeSec * 0.1));
    }
    if (detectedEvent?.confidence && this.leakyBuckets.hasOwnProperty(detectedEvent.type)) {
      this.leakyBuckets[detectedEvent.type] += detectedEvent.confidence;
    }

    // --- Tier 5: Real-time Feedback Routing ---
    if (this.leakyBuckets.monotone_segment >= 2.0) {
      this.leakyBuckets.monotone_segment = 0;
      return { event: detectedEvent, feedback: { message: 'Watch your tone — try emphasizing key words.', severity: 'red' } };
    }
    if (detectedEvent?.type === 'emphasis_peak' && cv > 0.25) {
      return { event: detectedEvent, feedback: { message: 'Great vocal emphasis just now!', severity: 'green' } };
    }
    if (detectedEvent?.type === 'trailing_off') {
      return { event: detectedEvent, feedback: { message: 'Finish strong — your voice trailed off there.', severity: 'yellow' } };
    }

    return { event: detectedEvent, feedback: null };
  }
}
