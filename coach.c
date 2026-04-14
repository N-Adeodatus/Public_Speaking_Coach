/**
 * coach.c — Public Speaking Coach Audio Engine
 *
 * Architecture:
 *   - AudioWorklet feeds 128-sample float32 chunks at 44,100 Hz (or 48,000 Hz).
 *   - This engine accumulates samples in a 1-second rolling window.
 *   - Every time the window is full it computes:
 *       • RMS Volume   (dBFS)
 *       • Pitch        (Hz, via autocorrelation — AMDF-paired)
 *       • Jitter       (cycle-to-cycle pitch variation in milliseconds)
 *   - Results are written to a small shared "metrics" struct so the JS
 *     side can read them without an extra copy.
 *
 * Build:
 *   emcc coach.c -o engine.js \
 *       -O3 \
 *       -s WASM=1 \
 *       -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPF32","HEAP32"]' \
 *       -s EXPORTED_FUNCTIONS='["_engine_init","_engine_push","_engine_get_metrics","_engine_reset","_malloc","_free"]' \
 *       -s ALLOW_MEMORY_GROWTH=1 \
 *       -s MODULARIZE=1 \
 *       -s EXPORT_NAME="EngineModule"
 */

#include <emscripten.h>
#include <math.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

/* ------------------------------------------------------------------ */
/*  Configuration constants                                            */
/* ------------------------------------------------------------------ */

#define MAX_SAMPLE_RATE   48000
#define WINDOW_SECONDS    1           /* rolling window length */
#define MAX_WINDOW_SIZE   (MAX_SAMPLE_RATE * WINDOW_SECONDS)

/* Autocorrelation pitch range (human voice: 80 Hz – 500 Hz) */
#define PITCH_MIN_HZ      80.0f
#define PITCH_MAX_HZ      500.0f

/* Jitter history – track up to 60 pitches per second for long-term jitter */
#define JITTER_HISTORY    60

/* Silence threshold in RMS amplitude (below ~-60 dBFS) */
#define SILENCE_THRESHOLD 0.001f

/* ------------------------------------------------------------------ */
/*  Internal state                                                     */
/* ------------------------------------------------------------------ */

static float     g_window[MAX_WINDOW_SIZE];   /* rolling sample buffer */
static int       g_write_pos;                 /* next write position   */
static int       g_filled;                    /* samples filled so far */
static int       g_sample_rate;
static int       g_window_size;               /* = sample_rate * WINDOW_SECONDS */

/* Pitch jitter tracking */
static float     g_pitch_history[JITTER_HISTORY];
static int       g_pitch_history_pos;
static int       g_pitch_history_count;

/* ------------------------------------------------------------------ */
/*  Metrics struct – shared with JavaScript                            */
/* ------------------------------------------------------------------ */

typedef struct {
    float volume_rms;     /* linear RMS amplitude [0, 1]        */
    float volume_db;      /* volume in dBFS (negative values)   */
    float pitch_hz;       /* fundamental frequency in Hz        */
    float jitter_ms;      /* mean absolute pitch jitter in ms   */
    int   window_ready;   /* 1 if a full window has been computed*/
} Metrics;

static Metrics g_metrics;

/* ------------------------------------------------------------------ */
/*  Helper: circular-buffer read access (index 0 = oldest sample)     */
/* ------------------------------------------------------------------ */

static inline float window_sample(int i) {
    /* When the window is not yet full we read linearly from 0 */
    if (!g_filled) return g_window[i];
    /* Once full, oldest sample is at g_write_pos */
    return g_window[(g_write_pos + i) % g_window_size];
}

/* ------------------------------------------------------------------ */
/*  1. RMS Volume                                                      */
/* ------------------------------------------------------------------ */

static float compute_rms(int n) {
    double sum = 0.0;
    for (int i = 0; i < n; i++) {
        double s = window_sample(i);
        sum += s * s;
    }
    return (float)sqrt(sum / n);
}

/* Convert linear amplitude to dBFS */
static float amplitude_to_db(float rms) {
    if (rms < 1e-9f) return -120.0f;
    return 20.0f * log10f(rms);
}

/* ------------------------------------------------------------------ */
/*  2. Autocorrelation Pitch Detection                                 */
/*                                                                     */
/*  We use the normalized autocorrelation (YIN-inspired) to find the  */
/*  first prominent peak in the lag range corresponding to our pitch   */
/*  search interval [PITCH_MIN_HZ, PITCH_MAX_HZ].                     */
/* ------------------------------------------------------------------ */

static float compute_pitch(int n) {
    int lag_min = (int)(g_sample_rate / PITCH_MAX_HZ);
    int lag_max = (int)(g_sample_rate / PITCH_MIN_HZ);

    /* Clamp lag_max to half the window so we have enough data */
    if (lag_max > n / 2) lag_max = n / 2;
    if (lag_min < 1)     lag_min = 1;
    if (lag_max <= lag_min) return 0.0f;

    /* --- Compute normalised autocorrelation for each lag --- */
    /*  r[lag] = SUM(x[i] * x[i+lag])                         */
    /*  r0     = SUM(x[i]^2)  (lag 0 — max energy)            */

    double r0 = 0.0;
    for (int i = 0; i < n; i++) {
        double s = window_sample(i);
        r0 += s * s;
    }

    if (r0 < 1e-12) return 0.0f; /* silence */

    float   best_corr = -1.0f;
    int     best_lag  = 0;

    for (int lag = lag_min; lag <= lag_max; lag++) {
        double r = 0.0;
        int    m = n - lag;
        for (int i = 0; i < m; i++) {
            r += (double)window_sample(i) * window_sample(i + lag);
        }
        /* Normalise so correlation is in [-1, 1] */
        float corr = (float)(r / r0);
        if (corr > best_corr) {
            best_corr = corr;
            best_lag  = lag;
        }
    }

    /*
     * Parabolic interpolation to refine the peak to sub-sample accuracy.
     * This converts the discrete lag into a fractional lag, giving much
     * better frequency resolution.
     */
    float refined_lag = (float)best_lag;
    if (best_lag > lag_min && best_lag < lag_max) {
        /* Compute autocorrelation at adjacent lags */
        double rp = 0.0, rm = 0.0;
        int mp = n - (best_lag + 1);
        int mm = n - (best_lag - 1);
        for (int i = 0; i < mp; i++)
            rp += (double)window_sample(i) * window_sample(i + best_lag + 1);
        for (int i = 0; i < mm; i++)
            rm += (double)window_sample(i) * window_sample(i + best_lag - 1);

        float c_prev = (float)(rm / r0);
        float c_curr = best_corr;
        float c_next = (float)(rp / r0);

        float denom = 2.0f * (2.0f * c_curr - c_prev - c_next);
        if (fabsf(denom) > 1e-6f) {
            refined_lag = (float)best_lag + (c_prev - c_next) / denom;
        }
    }

    /* Reject very low correlation — probably noise/unvoiced segment */
    if (best_corr < 0.3f) return 0.0f;

    return (float)g_sample_rate / refined_lag;
}

/* ------------------------------------------------------------------ */
/*  3. Jitter (cycle-to-cycle pitch variation)                        */
/*                                                                     */
/*  Jitter = mean |T[i] - T[i-1]| over the history window            */
/*  where T[i] = 1/F[i] is the pitch period in milliseconds.         */
/* ------------------------------------------------------------------ */

static void update_jitter_history(float pitch_hz) {
    if (pitch_hz > 0.0f) {
        g_pitch_history[g_pitch_history_pos % JITTER_HISTORY] = pitch_hz;
        g_pitch_history_pos++;
        if (g_pitch_history_count < JITTER_HISTORY) g_pitch_history_count++;
    }
}

static float compute_jitter(void) {
    if (g_pitch_history_count < 2) return 0.0f;

    int   count = g_pitch_history_count;
    float sum   = 0.0f;
    int   diffs = 0;

    for (int i = 1; i < count; i++) {
        int idx_curr = (g_pitch_history_pos - 1 - (count - 1 - i) + JITTER_HISTORY * 2) % JITTER_HISTORY;
        int idx_prev = (g_pitch_history_pos - 1 - (count - i)     + JITTER_HISTORY * 2) % JITTER_HISTORY;

        float hz_curr = g_pitch_history[idx_curr];
        float hz_prev = g_pitch_history[idx_prev];

        if (hz_curr > 0.0f && hz_prev > 0.0f) {
            float t_curr_ms = 1000.0f / hz_curr;
            float t_prev_ms = 1000.0f / hz_prev;
            sum += fabsf(t_curr_ms - t_prev_ms);
            diffs++;
        }
    }

    return (diffs > 0) ? sum / diffs : 0.0f;
}

/* ================================================================== */
/*  EXPORTED API                                                       */
/* ================================================================== */

/**
 * engine_init(sample_rate)
 * Must be called once before pushing any audio.
 * Returns 0 on success, -1 on failure.
 */
EMSCRIPTEN_KEEPALIVE
int engine_init(int sample_rate) {
    if (sample_rate < 8000 || sample_rate > MAX_SAMPLE_RATE) return -1;

    g_sample_rate        = sample_rate;
    g_window_size        = sample_rate * WINDOW_SECONDS;
    g_write_pos          = 0;
    g_filled             = 0;
    g_pitch_history_pos  = 0;
    g_pitch_history_count= 0;

    memset(g_window,        0, sizeof(g_window));
    memset(g_pitch_history, 0, sizeof(g_pitch_history));
    memset(&g_metrics,      0, sizeof(g_metrics));

    return 0;
}

/**
 * engine_push(ptr, num_samples)
 * Feed a block of float32 PCM samples (from the AudioWorklet buffer).
 * ptr is a pointer into the WASM heap (allocated with _malloc on JS side).
 * Returns 1 if the window is now complete (metrics updated), 0 otherwise.
 */
EMSCRIPTEN_KEEPALIVE
int engine_push(float* ptr, int num_samples) {
    if (!ptr || num_samples <= 0) return 0;

    /* Write samples into the circular window buffer */
    for (int i = 0; i < num_samples; i++) {
        g_window[g_write_pos] = ptr[i];
        g_write_pos = (g_write_pos + 1) % g_window_size;
        if (!g_filled) {
            g_filled++;
            if (g_filled >= g_window_size) g_filled = 0; /* sentinel: 0 means full */
        }
    }

    /* Track how many samples have ever been fed in (capped at window_size) */
    static int total_samples = 0;
    total_samples += num_samples;

    /* Only compute metrics once per full window */
    if (total_samples < g_window_size) return 0;

    /* Reset so we compute once per second (window_size = sample_rate) */
    total_samples -= g_window_size;

    int n = g_window_size;

    /* --- Volume --- */
    float rms = compute_rms(n);
    g_metrics.volume_rms = rms;
    g_metrics.volume_db  = amplitude_to_db(rms);

    /* --- Pitch --- */
    float pitch = (rms > SILENCE_THRESHOLD) ? compute_pitch(n) : 0.0f;
    g_metrics.pitch_hz = pitch;

    /* --- Jitter --- */
    update_jitter_history(pitch);
    g_metrics.jitter_ms = compute_jitter();

    g_metrics.window_ready = 1;
    return 1;
}

/**
 * engine_get_metrics()
 * Returns a pointer to the Metrics struct in WASM memory.
 * JavaScript reads it via HEAPF32 / HEAP32.
 * Layout (byte offsets, all float32 except window_ready which is int32):
 *   0  : volume_rms   (float)
 *   4  : volume_db    (float)
 *   8  : pitch_hz     (float)
 *   12 : jitter_ms    (float)
 *   16 : window_ready (int)
 */
EMSCRIPTEN_KEEPALIVE
Metrics* engine_get_metrics(void) {
    return &g_metrics;
}

/**
 * engine_reset()
 * Clears all internal state. Call this between sessions.
 */
EMSCRIPTEN_KEEPALIVE
void engine_reset(void) {
    g_write_pos           = 0;
    g_filled              = 0;
    g_pitch_history_pos   = 0;
    g_pitch_history_count = 0;
    memset(g_window,        0, sizeof(g_window));
    memset(g_pitch_history, 0, sizeof(g_pitch_history));
    memset(&g_metrics,      0, sizeof(g_metrics));
}
