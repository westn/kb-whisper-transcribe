# kb-whisper-transcribe

Zero-setup Swedish transcription CLI using KB-Whisper and `whisper.cpp`.

```bash
npx kb-whisper-transcribe "https://bucket.s3.amazonaws.com/audio.mp3" \
  --language sv \
  --format txt,json,srt \
  --out ./transcripts
```

On first run the CLI downloads a platform-specific `whisper-cli` runtime, uses the bundled `ffmpeg-static` binary to normalize audio, downloads the KB-Whisper GGML model, and writes transcript files locally.

## Requirements

- Node.js 20+
- macOS arm64/x64, Linux x64/arm64, or Windows x64

## Usage

```bash
kb-whisper-transcribe <input> [options]
```

`<input>` can be a local audio/video file or an `http(s)` URL, including presigned S3 HTTPS URLs.

Options:

- `--language <code>` default `sv`
- `--format <list>` comma-separated `txt,json,srt,vtt`, default `txt`
- `--out <dir>` default `./transcripts`
- `--model <name>` default `kb-whisper-large-q5_0`
- `--model-path <path>` use a local GGML model file
- `--cache-dir <dir>` override cache location
- `--max-file-size-mb <n>` default `1000`
- `--timeout-ms <n>` default `1800000`
- `--whisper-path <path>` use an existing `whisper-cli` binary
- `--ffmpeg-path <path>` use an existing `ffmpeg` binary
- `--force` overwrite existing outputs
- `--keep-temp` keep temporary files
- `--verbose` show detailed logs

## Caching

Runtime assets and models are cached under the OS cache directory using `env-paths`, e.g. `~/.cache/kb-whisper-transcribe` on Linux. Downloads are checksum-verified and protected by simple lock files so parallel runs do not corrupt cache entries.

## Runtime releases

The default runtime manifest is expected at:

```text
https://github.com/westn/kb-whisper-transcribe/releases/download/whispercpp-runtime-v0.1.0/runtime-manifest.json
```

Maintainers can build these assets with the `Build whisper.cpp runtime` GitHub Actions workflow. For development, pass `--whisper-path /path/to/whisper-cli` or set `WHISPER_CPP_PATH`.

## Security

Remote downloads reject private/local IP ranges before fetching, enforce maximum byte limits, write through temporary files, and verify SHA-256 checksums for model/runtime assets.

## License notices

This wrapper is MIT licensed. It downloads/uses third-party components with their own licenses:

- KB-Whisper model by KBLab (see Hugging Face model card/license)
- whisper.cpp (MIT)
- FFmpeg via `ffmpeg-static` (license depends on distributed binary build)
