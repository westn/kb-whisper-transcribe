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

## Maintainer release checklist

Merging code to `main` runs CI, but it does **not** automatically publish the native runtime binaries or the npm package. For a release that works with `npx` on first run:

1. Merge the implementation PR to `main`.
2. In GitHub Actions, manually run **Build whisper.cpp runtime** with:
   ```text
   runtime_version = whispercpp-runtime-v0.1.0
   ```
   This publishes the `whisper-cli-*` archives and `runtime-manifest.json` release assets.
3. Verify the runtime manifest exists at the URL below.
4. Configure the repository secret `NPM_TOKEN` if it is not already configured.
5. Publish the npm package by creating a `v0.1.0` GitHub release/tag or manually running **Publish npm**.
6. Smoke-test from a clean machine/cache:
   ```bash
   npx kb-whisper-transcribe --help
   ```

## Runtime releases

The default runtime manifest is expected at:

```text
https://github.com/westn/kb-whisper-transcribe/releases/download/whispercpp-runtime-v0.1.0/runtime-manifest.json
```

For development, pass `--whisper-path /path/to/whisper-cli` or set `WHISPER_CPP_PATH`.

## License and naming notes

This package is an independent wrapper and is **not affiliated with or endorsed by KBLab or the National Library of Sweden**.

Known upstream licenses at the time of implementation:

- **KB-Whisper model**: Apache-2.0 according to the Hugging Face model card for `KBLab/kb-whisper-large`.
- **whisper.cpp**: MIT.
- **ffmpeg-static / FFmpeg binary**: the npm package is licensed `GPL-3.0-or-later`; FFmpeg binary licensing depends on the exact build configuration.
- **Primary npm runtime dependencies**: `commander` MIT, `env-paths` MIT, `tar` BlueOak-1.0.0.

The project name `kb-whisper-transcribe` is descriptive of the model it uses. The Apache-2.0 model license permits use, modification, and distribution subject to its terms, but it does not grant trademark rights. If you want the lowest naming-risk posture, keep the affiliation disclaimer above and avoid branding that suggests this is an official KBLab package.

Because `ffmpeg-static` currently brings GPL-licensed binaries, review your distribution goals before publishing commercially or embedding this package in a closed-source product. If you need a permissive-only dependency chain, replace it with a separately downloaded LGPL-only FFmpeg build or require users to provide `--ffmpeg-path`.

## Security

Remote downloads reject private/local IP ranges before fetching, enforce maximum byte limits, write through temporary files, and verify SHA-256 checksums for model/runtime assets.

## License notices

This wrapper is MIT licensed. It downloads/uses third-party components with their own licenses:

- KB-Whisper model by KBLab (see Hugging Face model card/license)
- whisper.cpp (MIT)
- FFmpeg via `ffmpeg-static` (license depends on distributed binary build)
