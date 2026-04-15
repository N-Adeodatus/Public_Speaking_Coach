$ErrorActionPreference = "Stop"

$SRC = "coach.c"
$OUT_DIR = "dist"
$OUT_NAME = "engine"

# Sanity check
if (!(Get-Command emcc -ErrorAction SilentlyContinue)) {
    $EmsdkPs1 = "C:\Users\USER\Documents\emsdk\emsdk_env.ps1"
    if (Test-Path $EmsdkPs1) {
        Write-Host "Auto-activating Emscripten Environment..." -ForegroundColor Cyan
        . $EmsdkPs1 | Out-Null
    } else {
        Write-Host "ERROR: emcc not found and couldn't find emsdk_env.ps1." -ForegroundColor Red
        exit 1
    }
}

$EmccVer = (emcc --version)[0]
Write-Host "==> Emscripten version: $EmccVer"

if (!(Test-Path -Path $OUT_DIR)) {
    New-Item -ItemType Directory -Path $OUT_DIR | Out-Null
}

Write-Host "==> Compiling $SRC -> $OUT_DIR/$OUT_NAME.js + $OUT_NAME.wasm ..."

# We use an argument list array here because PowerShell's quote parsing
# can get messy when passing JSON strings like "['a', 'b']" to .bat files.
$EmccArgs = @(
    $SRC,
    "-o", "$OUT_DIR/$OUT_NAME.js",
    "-O3",
    "-s", "WASM=1",
    "-s", "MODULARIZE=1",
    "-s", "EXPORT_NAME=`"EngineModule`"",
    "-s", "ALLOW_MEMORY_GROWTH=1",
    "-s", "EXPORTED_RUNTIME_METHODS=`"['ccall','cwrap','HEAPF32','HEAP32']`"",
    "-s", "EXPORTED_FUNCTIONS=`"['_engine_init','_engine_push','_engine_get_metrics','_engine_reset','_malloc','_free']`"",
    "-s", "ENVIRONMENT=`"web,worker`"",
    "-lm"
)

& emcc @EmccArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "==> Build successful!" -ForegroundColor Green
Write-Host "    $OUT_DIR/$OUT_NAME.js"
Write-Host "    $OUT_DIR/$OUT_NAME.wasm"
Write-Host "`nNext step: open test_engine.html in a browser (requires a local HTTP server)."
Write-Host "  e.g.:  npx serve ."
