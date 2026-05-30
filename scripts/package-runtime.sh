#!/usr/bin/env bash
set -euo pipefail
binary="${1:?path to whisper-cli binary}"
platform="${2:?platform key, e.g. darwin-arm64}"
out="whisper-cli-${platform}.tar.gz"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
if [[ "$platform" == win32-* ]]; then
  cp "$binary" "$tmp/whisper-cli.exe"
else
  cp "$binary" "$tmp/whisper-cli"
  chmod +x "$tmp/whisper-cli"
fi
tar -czf "$out" -C "$tmp" .
shasum -a 256 "$out"
