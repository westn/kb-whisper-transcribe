#!/usr/bin/env bash
set -euo pipefail
ref="${WHISPER_CPP_REF:-master}"
workdir="${1:-/tmp/kb-whisper-runtime}"
rm -rf "$workdir"
git clone --depth 1 --branch "$ref" https://github.com/ggml-org/whisper.cpp "$workdir/whisper.cpp"
cmake -S "$workdir/whisper.cpp" -B "$workdir/whisper.cpp/build" -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build "$workdir/whisper.cpp/build" --config Release --target whisper-cli --parallel
