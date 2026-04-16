# 🎙️ PS Coach — Public Speaking Coach

A real-time, browser-native public speaking analysis engine that listens to your microphone and gives live behavioral feedback. Built entirely with the Web Audio API and pure JavaScript DSP — no cloud processing, no latency, no external dependencies.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
  - [Audio Pipeline](#audio-pipeline)
  - [Pitch Detection (Autocorrelation)](#pitch-detection-autocorrelation)
  - [Voice Activity Detection (VAD)](#voice-activity-detection-vad)
  - [Sentence-Drop Detection](#sentence-drop-detection)
  - [Pitch Variation Coaching (CV)](#pitch-variation-coaching-cv)
- [Metrics Reference](#metrics-reference)
- [Real-time Graph](#real-time-graph)
- [Calibration](#calibration)
- [Project Structure](#project-structure)
- [Running Locally](#running-locally)
- [Browser Compatibility](#browser-compatibility)
- [Design Decisions](#design-decisions)
- [Future Roadmap](#future-roadmap)

---

## Overview

PS Coach captures your microphone stream in real time and analyses the acoustic properties of your speech. It detects:

- Whether you are currently speaking or silent
- Your fundamental voice pitch (F0) in Hz
- How monotone or expressive your delivery is (Pitch CV)
- Whether you are fading out at the end of sentences
- The overall loudness of your voice (RMS amplitude)

All processing runs inside a Web Audio **AudioWorklet** — a high-priority audio thread that is never blocked by the main JavaScript thread. This makes the analysis accurate, low-latency, and suitable for real-time coaching.

---

## Features

| Feature | Details |
|---|---|
| **Real-time pitch tracking** | Autocorrelation-based F0 detection, 70–400 Hz range |
| **Monotone detection** | Rolling coefficient of variation (CV) over the last ~5 seconds of voiced speech |
| **Sentence-drop detection** | Detects when RMS falls >35% from the first half to the last quarter of a voiced segment |
| **Voice Activity Detection** | Hysteresis-based VAD combining power and pitch evidence, with whisper fallback |
| **5-second calibration phase** | Learns your ambient noise floor to set a personalised silence threshold |
| **Live feedback board** | Full-screen colour-coded coaching messages with a 2.5-second cooldown |
| **Advanced metrics panel** | Per-metric cards showing raw F0, RMS, pitch CV, and VAD state |
| **Real-time graph** | Scrolling multi-line Canvas graph showing all four metrics simultaneously over time |
| **No network dependency** | 100% browser-native; no API calls, no WASM loading delay |

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                        Browser Main Thread                 │
│                                                            │
│  test_engine.html                                          │
│  ├─ getUserMedia()  →  MediaStream                         │
│  ├─ AudioContext    →  createMediaStreamSource()           │
│  ├─ AudioWorkletNode('coach-processor')                    │
│  │    └─ port.onmessage → processMetrics()                 │
│  │         ├─ Update metric cards (F0, RMS, CV, VAD)       │
│  │         ├─ Trigger coaching feedback (setFeedback)      │
│  │         └─ Push to graph (pushGraphPoint / drawGraph)   │
│  └─ Canvas 2D graph (pure JS rendering)                    │
└────────────────────────────────────────────────────────────┘
                          │ port.postMessage (METRICS @ ~10 Hz)
                          ▼
┌────────────────────────────────────────────────────────────┐
│                   AudioWorklet Thread                      │
│                                                            │
│  essentia_worklet.js  (CoachProcessor)                     │
│  ├─ Accumulates 128-sample quanta into a 2048-sample ring  │
│  │  buffer (50% overlap)                                   │
│  ├─ Per-frame analysis:                                    │
│  │   1. RMS (loudness)                                     │
│  │   2. Autocorrelation pitch (with octave-jump reject)    │
│  │   3. Median smoothing (5-frame window)                  │
│  │   4. VAD (hysteresis, 250 ms onset/offset)              │
│  │   5. Segment tracking + sentence-drop evaluation        │
│  └─ Posts METRICS message to main thread ~10×/sec          │
└────────────────────────────────────────────────────────────┘
```

---

## How It Works

### Audio Pipeline

The browser captures the raw PCM microphone stream via `getUserMedia`. It is routed through a `MediaStreamSourceNode` into a `CoachProcessor` AudioWorklet node.

The Web Audio engine delivers audio in render quanta of **128 samples** at a time. The worklet accumulates these quanta into a **2048-sample ring buffer** and performs frame analysis each time the buffer is full, using a **50% overlap hop** (1024 samples) so no data is wasted between adjacent frames.

At a 44.1 kHz or 48 kHz sample rate a full analysis frame covers approximately **42–46 ms** of audio, while the hop means a new analysis result is produced roughly every **21–23 ms**.

---

### Pitch Detection (Autocorrelation)

Pitch is estimated in `autocorrPitch()` using the classical **time-domain autocorrelation** method:

1. **RMS gate** — if the frame is essentially silent (RMS < 0.003), skip pitch estimation entirely and return 0.
2. **Autocorrelation** — compute `AC[lag]` for lags 0 … N/2. The dominant periodic component produces a peak at the lag corresponding to one period of the fundamental frequency.
3. **Initial-dip skip** — walk forward from lag 0 until AC stops decreasing. This skips the trivial zero-lag maximum.
4. **Peak search** — find the lag with the highest correlation value after the dip.
5. **Parabolic interpolation** — refine the peak position to sub-sample accuracy using the values at `lag-1` and `lag+1`, reducing quantisation noise.
6. **Confidence gate** — if `AC[peak] / AC[0] < 0.5` the signal is too noisy or aperiodic to trust; return 0.
7. **F0** = `sampleRate / refinedLag`

**Post-detection filtering chain applied on top:**

| Filter | Purpose |
|---|---|
| Range clamp (70–400 Hz) | Eliminates sub-harmonic and overtone artefacts outside the human voice range |
| Octave-jump rejection | Rejects a new estimate if it is more than 1.8× or less than 0.55× the previous frame's pitch |
| 5-frame median smoother | Removes frame-to-frame jitter without introducing musical-pitch smearing |

---

### Voice Activity Detection (VAD)

VAD uses a **dual-criterion, hysteresis-based** state machine:

- **Voiced onset**: A frame is considered voiced if it has both sufficient power (`rms > silenceThreshold`) **and** a valid pitch estimate (`smoothF0 > 0`). Each qualifying frame accumulates time into `voicedRunMs`.
- **Whisper fallback**: If vocal power is present but no pitch is detected, and the speaker was already in a voiced run (> 200 ms), the voiced run continues. This keeps VAD active during fricatives, whispers, and stop consonants.
- **Silence offset**: Silence frames accumulate into `silenceRunMs`. After **250 ms** of sustained silence the voiced run resets to zero.

This approach avoids false triggers on short breath pauses and prevents premature VAD cutoff during typical sentence pauses.

---

### Sentence-Drop Detection

At the end of every voiced segment (VAD transition voiced → silent) the worklet evaluates whether the speaker's volume dropped off significantly:

1. Collect the per-frame RMS values across the entire voiced segment.
2. Compare the **mean RMS of the first 50%** of frames vs. the **mean RMS of the last 25%** of frames.
3. If the tail mean is less than **65%** of the head mean, a `sentenceDrop` event is posted.
4. The main thread counts consecutive sentence-drop events; after **3 consecutive drops** it triggers the red coaching message: *"Finish your sentences stronger."*

Segments shorter than 500 ms or with fewer than 4 frames are ignored to avoid false positives on short utterances like "yes" or "ok."

---

### Pitch Variation Coaching (CV)

On the main thread, every voiced F0 sample is pushed into a rolling buffer (`shortWindowCV`, max 50 entries ≈ 5 seconds of voiced speech). When the buffer has more than 10 entries, the **Coefficient of Variation** is computed:

```
CV = stdDev(F0) / mean(F0)
```

CV is only computed if the mean F0 ≥ 80 Hz (guards against instability at near-floor pitch values).

| CV Range | Interpretation | Feedback |
|---|---|---|
| < 0.10 | Flat / monotone | 🔴 "You sound monotone. Try varying your pitch." |
| 0.10 – 0.20 | Natural variation | 🟢 "Good pitch variation." |
| > 0.20 | Highly expressive | 🟢 "Very expressive delivery!" |

---

## Metrics Reference

| Metric | Unit | Source | Notes |
|---|---|---|---|
| **F0 (Pitch)** | Hz | `CoachProcessor.autocorrPitch()` | 70–400 Hz valid range; `—` when unvoiced |
| **RMS (Loudness)** | Raw amplitude (0–1) | `CoachProcessor.analyseFrame()` | Multiply × 1000 for graph display |
| **Pitch CV** | Dimensionless ratio | Computed on main thread | Multiply × 100 for graph display; only valid when voiced & mean F0 ≥ 80 Hz |
| **VAD** | Boolean / 0 or 100 | `CoachProcessor.analyseFrame()` | Displayed as 100 (voiced) or 0 (silent) on the graph |

---

## Real-time Graph

The graph panel renders all four metrics simultaneously on a `<canvas>` element, updated on every `METRICS` message (~10 Hz).

**Design:**

- **Rolling 300-sample window** — the graph always shows the most recent 300 data points; older data scrolls off the left edge.
- **Normalised Y-axis per series** — each metric has its own min/max range so all four are clearly visible regardless of their unit magnitudes.
- **Glow lines** — each series has a subtle `shadowBlur` effect that distinguishes it on the dark background.
- **Live tip labels** — the current value of each metric is printed next to the rightmost point of its line.
- **Horizontal grid** — 5 faint guide lines help estimate relative values.
- **"oldest → now" labels** — time direction is always labelled.
- **Clear button** — resets all graph buffers without stopping the audio session.

| Series | Colour | Displayed scale |
|---|---|---|
| Pitch F0 | 🔵 Blue `#6c8efb` | Raw Hz, 0–400 |
| RMS | 🟢 Green `#4ade80` | ×1000, 0–60 |
| Pitch CV | 🟡 Yellow `#facc15` | ×100, 0–40 |
| VAD | 🔴 Red `#f87171` | 0 or 100 |

---

## Calibration

On startup the engine enters a **5-second calibration phase** before it begins coaching.

During calibration the worklet collects raw RMS values from every analysis frame. When calibration ends:

```
silenceThreshold = max(mean(calibrationRms) × 0.3, 0.003)
```

This personalises the silence gate to the user's environment. If `stdDev(calibrationRms) > 0.1` a noisy-environment warning is shown, but coaching proceeds regardless.

> **Tip:** Speak naturally during calibration — the system needs samples of your typical speaking voice to set the threshold correctly. Do not stay silent.

---

## Project Structure

```
PS_coach/
├── test_engine.html       # Testing dashboard — all UI, controls, feedback, and graph
├── essentia_worklet.js    # AudioWorklet processor — all real-time DSP logic
├── dist/
│   ├── engine.js          # Compiled Emscripten JS glue (WASM build, reserved)
│   └── engine.wasm        # Compiled C engine (WASM build, reserved)
├── package_contents.json  # Package manifest
└── README.md              # This file
```

> **Note on `dist/`:** The WASM build (`engine.js` + `engine.wasm`) is a compiled C implementation of the same DSP pipeline, built with Emscripten. The current production path uses the pure-JS `essentia_worklet.js` for zero-latency startup and maximum reliability across browsers. The WASM build is preserved for future integration.

---

## Running Locally

Because AudioWorklets are loaded via `addModule()`, the HTML file **must be served over HTTP** — opening it directly as a `file://` URL will cause a CORS/module error.

**Option 1 — VS Code Live Server**

Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer), right-click `test_engine.html` → *Open with Live Server*.

**Option 2 — Node `http-server`**

```bash
npx http-server . -p 8080
# then open http://localhost:8080/test_engine.html
```

**Option 3 — Python**

```bash
# Python 3
python -m http.server 8080
# then open http://localhost:8080/test_engine.html
```

> Microphone access requires `localhost` or an HTTPS origin. Any of the above options will satisfy that requirement.

---

## Browser Compatibility

| Browser | Support |
|---|---|
| Chrome / Edge 79+ | ✅ Full support |
| Firefox 76+ | ✅ Full support |
| Safari 14.1+ | ✅ Full support |
| Mobile Chrome (Android) | ✅ Full support |
| Mobile Safari (iOS 14.5+) | ✅ Full support |

AudioWorklet is the only non-trivial API dependency. All major modern browsers have had stable support since 2020.

---

## Design Decisions

**Why pure-JS DSP instead of WASM?**

The `dist/` directory contains a compiled Emscripten/WASM build. However, loading WASM requires a network round-trip before the AudioWorklet can start, which introduces a startup delay and a loading failure mode. The pure-JS autocorrelation implementation starts instantly, performs well at 10 Hz analysis rate, and has no compile-time or loading dependencies.

**Why 2048-sample frames?**

Pitch detection accuracy improves with frame length. A 2048-sample frame at 44.1 kHz covers ~46 ms, providing lag resolution down to ~21 Hz — well below the 70 Hz floor used for voice. Shorter frames (e.g., 512 samples) would produce significantly more octave-jump artefacts.

**Why 50% overlap?**

Overlap prevents the "dead zone" between frames where a transient or pitch change could occur and be missed entirely. It doubles the effective temporal resolution of the analysis without doubling CPU cost.

**Why coefficient of variation (CV) and not raw standard deviation for pitch variety?**

CV (`stdDev / mean`) is dimensionless and speaker-agnostic. A soprano's standard deviation in Hz is naturally much larger than a bass speaker's even at similar expressiveness. CV normalises for this, giving a fair measure regardless of whether the speaker's voice is naturally high or low.

**Why median smoothing instead of low-pass filtering for F0?**

Median filters are better at preserving pitch **steps** (deliberate inflections) while rejecting outlier spikes (octave errors that slipped through). A low-pass filter would smear rapid legitimate pitch changes.

---

## Future Roadmap

- [ ] **Speaking pace analysis** — syllables-per-minute using voiced-segment events
- [ ] **Filler word detection** — integrate speech recognition output (e.g., Web Speech API) to count "um", "uh", "like"
- [ ] **Session recording & playback** — save the metric time-series to Puter cloud storage for post-session review
- [ ] **Historical trend view** — compare performance across multiple sessions
- [ ] **WASM engine integration** — activate the compiled C engine from `dist/` for higher-throughput feature extraction (e.g., spectral centroid, MFCCs)
- [ ] **React frontend** — migrate the testing dashboard into a full React app with routing and user accounts
- [ ] **Personalised coaching profiles** — learn each speaker's baseline over multiple sessions and adapt thresholds dynamically

---

## License

This project is currently private and unlicensed. All rights reserved.
