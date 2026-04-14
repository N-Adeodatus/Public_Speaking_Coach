#!/usr/bin/env bash
# =============================================================================
# build.sh — Compile coach.c to WebAssembly using Emscripten (run in WSL)
#
# Prerequisites:
#   source /path/to/emsdk/emsdk_env.sh   (activate Emscripten in WSL)
#
# Usage:
#   chmod +x build.sh
#   ./build.sh
#
# Outputs:
#   dist/engine.js   — JS glue code (auto-loads engine.wasm)
#   dist/engine.wasm — The compiled WebAssembly binary
# =============================================================================

set -e  # Exit immediately on error

# ---- Configurable paths --------------------------------------------------
SRC="coach.c"
OUT_DIR="dist"
OUT_NAME="engine"

# ---- Sanity check ---------------------------------------------------------
if ! command -v emcc &> /dev/null; then
    echo "ERROR: emcc not found. Please activate the Emscripten SDK first:"
    echo "  source /path/to/emsdk/emsdk_env.sh"
    exit 1
fi

echo "==> Emscripten version: $(emcc --version | head -1)"

# ---- Create output directory ----------------------------------------------
mkdir -p "$OUT_DIR"

# ---- Compile --------------------------------------------------------------
echo "==> Compiling $SRC → $OUT_DIR/$OUT_NAME.js + $OUT_NAME.wasm ..."

emcc "$SRC" \
    -o "$OUT_DIR/$OUT_NAME.js" \
    -O3 \
    -s WASM=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="EngineModule" \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPF32","HEAP32"]' \
    -s EXPORTED_FUNCTIONS='["_engine_init","_engine_push","_engine_get_metrics","_engine_reset","_malloc","_free"]' \
    -s ENVIRONMENT='web,worker' \
    -lm

echo "==> Build successful!"
echo "    dist/$OUT_NAME.js"
echo "    dist/$OUT_NAME.wasm"
echo ""
echo "Next step: open test_engine.html in a browser (requires a local HTTP server)."
echo "  e.g.:  npx serve ."
