Below is an implementation spec for a zero-setup CLI package:

```bash
npx kb-whisper-transcribe \
  "https://bucket.s3.amazonaws.com/audio.mp3" \
  --language sv \
  --format txt,json,srt \
  --out ./transcripts
```

The core design is: **Node CLI → bundled/downloaded runtime → bundled/downloaded ffmpeg → cached KB-Whisper model → local whisper.cpp transcription → output files**.

KB-Whisper is a good default for this because KBLab provides Swedish-specialized Whisper models trained on 50,000+ hours of Swedish speech and reports strong Swedish WER improvements over OpenAI Whisper large-v3. `whisper.cpp` is MIT licensed and supports macOS Intel/Arm, Linux, Windows, iOS, Android, WebAssembly, and more, making it the right native backend for a Node wrapper. ([Hugging Face][1])

---

# 1. Target product behavior

The user has only Node.js installed.

On first run:

```bash
npx kb-whisper-transcribe "https://bucket.s3.amazonaws.com/audio.mp3" \
  --language sv \
  --format txt,json,srt \
  --out ./transcripts
```

The package should:

1. Install temporarily via `npx`.
2. Detect platform, for example `darwin-arm64`.
3. Ensure a compatible `whisper-cli` binary exists.
4. Ensure an `ffmpeg` binary exists.
5. Download and cache the KB-Whisper GGML model.
6. Download the input audio URL to a temp directory.
7. Convert it to clean 16 kHz mono WAV.
8. Run `whisper-cli`.
9. Write output files to `./transcripts`.
10. Exit with useful logs and a non-zero code on failure.

Expected output:

```text
./transcripts/audio.txt
./transcripts/audio.json
./transcripts/audio.srt
```

No `brew`, no `cmake`, no manual model download.

---

# 2. Architecture

Use one public NPM package:

```text
kb-whisper-transcribe
```

Use GitHub for:

```text
- source repository
- GitHub Actions CI
- building precompiled whisper.cpp binaries
- GitHub Releases for runtime assets
- publishing the NPM package
```

Recommended runtime flow:

```text
CLI input
  ↓
parse args
  ↓
resolve runtime paths
  ↓
ensure ffmpeg
  ↓
ensure whisper-cli
  ↓
ensure KB-Whisper model
  ↓
download/copy audio input
  ↓
convert with ffmpeg
  ↓
run whisper-cli
  ↓
collect output files
  ↓
print summary
```

---

# 3. Repository structure

```text
kb-whisper-transcribe/
├─ package.json
├─ tsconfig.json
├─ README.md
├─ LICENSE
├─ NOTICE
├─ src/
│  ├─ cli.ts
│  ├─ index.ts
│  ├─ transcribe.ts
│  ├─ config.ts
│  ├─ runtime/
│  │  ├─ platform.ts
│  │  ├─ ensureFfmpeg.ts
│  │  ├─ ensureWhisper.ts
│  │  ├─ ensureModel.ts
│  │  ├─ checksums.ts
│  │  └─ runtimeManifest.ts
│  ├─ io/
│  │  ├─ download.ts
│  │  ├─ ssrf.ts
│  │  ├─ paths.ts
│  │  └─ temp.ts
│  ├─ audio/
│  │  └─ convertToWav.ts
│  ├─ whisper/
│  │  ├─ runWhisper.ts
│  │  └─ parseOutputs.ts
│  └─ errors.ts
├─ scripts/
│  ├─ build-whisper-runtime.sh
│  └─ package-runtime.sh
└─ .github/
   └─ workflows/
      ├─ ci.yml
      ├─ build-runtime.yml
      └─ publish-npm.yml
```

---

# 4. Package dependencies

Use TypeScript and keep dependencies small.

```json
{
  "name": "kb-whisper-transcribe",
  "version": "0.1.0",
  "description": "Zero-setup Swedish transcription CLI using KB-Whisper and whisper.cpp",
  "type": "module",
  "bin": {
    "kb-whisper-transcribe": "./dist/cli.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE",
    "NOTICE"
  ],
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "lint": "eslint .",
    "test": "vitest run",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "commander": "^14.0.0",
    "env-paths": "^3.0.0",
    "ffmpeg-static": "^5.2.0",
    "tar": "^7.4.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0",
    "eslint": "^9.0.0"
  }
}
```

`ffmpeg-static` gives the zero-setup UX, but check license obligations before commercial distribution. FFmpeg is generally LGPL, but builds can become GPL depending on enabled components; include notices and verify the exact binary distribution you use. ([FFmpeg][2])

---

# 5. CLI contract

## Command

```bash
npx kb-whisper-transcribe <input> [options]
```

## Inputs

Support in v0.1:

```text
https://...
http://...
./local-file.mp3
/path/to/local-file.wav
```

Defer native `s3://bucket/key` support to v0.2. For v0.1, tell users to pass public or presigned S3 HTTPS URLs.

## Options

```text
--language <code>          Default: sv
--format <list>            txt,json,srt,vtt. Default: txt
--out <dir>                Default: ./transcripts
--model <name>             Default: kb-whisper-large-q5_0
--model-path <path>        Use local model file instead of downloading
--cache-dir <dir>          Override cache directory
--max-file-size-mb <n>     Default: 1000
--timeout-ms <n>           Default: 1800000
--force                    Overwrite existing output files
--keep-temp                Keep downloaded/converted temp files
--verbose                  Print detailed logs
--version
--help
```

Example:

```bash
npx kb-whisper-transcribe ./audio.mp3 \
  --language sv \
  --format txt,json,srt,vtt \
  --out ./transcripts \
  --verbose
```

---

# 6. Cache layout

Use `env-paths`.

Default cache locations:

```text
macOS:   ~/Library/Caches/kb-whisper-transcribe
Linux:   ~/.cache/kb-whisper-transcribe
Windows: %LOCALAPPDATA%/kb-whisper-transcribe/Cache
```

Internal structure:

```text
cache/
├─ models/
│  └─ kb-whisper-large-q5_0/
│     └─ ggml-model-q5_0.bin
├─ runtimes/
│  └─ whisper.cpp/
│     └─ <runtime-version>/
│        └─ darwin-arm64/
│           └─ whisper-cli
└─ downloads/
```

Use lock files during model/runtime download:

```text
cache/models/kb-whisper-large-q5_0/.lock
cache/runtimes/whisper.cpp/<version>/<platform>/.lock
```

This prevents two parallel `npx` runs from corrupting a partially downloaded model.

---

# 7. Runtime binaries

Do not compile on the user’s machine.

Build `whisper-cli` in GitHub Actions and attach assets to GitHub Releases.

Supported v0.1 platforms:

```text
darwin-arm64
darwin-x64
linux-x64
linux-arm64
win32-x64
```

Start with `darwin-arm64` if you want the fastest path for Mac M1, but the package should fail clearly on unsupported platforms.

Asset naming:

```text
whisper-cli-darwin-arm64.tar.gz
whisper-cli-darwin-x64.tar.gz
whisper-cli-linux-x64.tar.gz
whisper-cli-linux-arm64.tar.gz
whisper-cli-win32-x64.zip
runtime-manifest.json
```

`runtime-manifest.json`:

```json
{
  "version": "whispercpp-2026-05-30-a1b2c3d",
  "assets": {
    "darwin-arm64": {
      "url": "https://github.com/YOUR_ORG/kb-whisper-transcribe/releases/download/runtime-whispercpp-2026-05-30-a1b2c3d/whisper-cli-darwin-arm64.tar.gz",
      "sha256": "REPLACE_WITH_SHA256",
      "binary": "whisper-cli"
    },
    "linux-x64": {
      "url": "https://github.com/YOUR_ORG/kb-whisper-transcribe/releases/download/runtime-whispercpp-2026-05-30-a1b2c3d/whisper-cli-linux-x64.tar.gz",
      "sha256": "REPLACE_WITH_SHA256",
      "binary": "whisper-cli"
    },
    "win32-x64": {
      "url": "https://github.com/YOUR_ORG/kb-whisper-transcribe/releases/download/runtime-whispercpp-2026-05-30-a1b2c3d/whisper-cli-win32-x64.zip",
      "sha256": "REPLACE_WITH_SHA256",
      "binary": "whisper-cli.exe"
    }
  }
}
```

The NPM package should contain the runtime manifest URL and cache the downloaded binary.

---

# 8. Model manifest

Start with one default model:

```text
kb-whisper-large-q5_0
```

Manifest:

```ts
export const MODELS = {
  "kb-whisper-large-q5_0": {
    fileName: "ggml-model-q5_0.bin",
    url: "https://huggingface.co/KBLab/kb-whisper-large/resolve/main/ggml-model-q5_0.bin",
    sha256: "REPLACE_WITH_REAL_SHA256",
    languageDefault: "sv"
  }
} as const;
```

Do not skip checksum verification. Large downloads fail often, and bad model files create confusing transcription errors.

---

# 9. Core TypeScript implementation

## `src/cli.ts`

```ts
#!/usr/bin/env node

import { Command } from "commander";
import { transcribe } from "./transcribe.js";

const program = new Command();

program
  .name("kb-whisper-transcribe")
  .description("Zero-setup Swedish transcription using KB-Whisper and whisper.cpp")
  .argument("<input>", "Audio URL or local file path")
  .option("--language <code>", "Language code", "sv")
  .option("--format <list>", "Comma-separated output formats: txt,json,srt,vtt", "txt")
  .option("--out <dir>", "Output directory", "./transcripts")
  .option("--model <name>", "Model name", "kb-whisper-large-q5_0")
  .option("--model-path <path>", "Use a local GGML model file")
  .option("--cache-dir <dir>", "Override cache directory")
  .option("--max-file-size-mb <n>", "Maximum input download size", "1000")
  .option("--timeout-ms <n>", "Transcription timeout in ms", "1800000")
  .option("--force", "Overwrite existing output files", false)
  .option("--keep-temp", "Keep temporary files", false)
  .option("--verbose", "Verbose logs", false)
  .action(async (input, options) => {
    try {
      const result = await transcribe({
        input,
        language: options.language,
        formats: options.format.split(",").map((s: string) => s.trim()),
        outDir: options.out,
        model: options.model,
        modelPath: options.modelPath,
        cacheDir: options.cacheDir,
        maxFileSizeMb: Number(options.maxFileSizeMb),
        timeoutMs: Number(options.timeoutMs),
        force: Boolean(options.force),
        keepTemp: Boolean(options.keepTemp),
        verbose: Boolean(options.verbose)
      });

      console.log(`✓ Transcript written`);
      for (const [format, file] of Object.entries(result.files)) {
        console.log(`  ${format}: ${file}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ ${message}`);
      process.exitCode = 1;
    }
  });

program.parseAsync();
```

## `src/transcribe.ts`

```ts
import path from "node:path";
import fs from "node:fs/promises";
import { makeTempDir, cleanupTempDir } from "./io/temp.js";
import { resolveInputToFile } from "./io/download.js";
import { ensureFfmpeg } from "./runtime/ensureFfmpeg.js";
import { ensureWhisper } from "./runtime/ensureWhisper.js";
import { ensureModel } from "./runtime/ensureModel.js";
import { convertToWav } from "./audio/convertToWav.js";
import { runWhisper } from "./whisper/runWhisper.js";
import { parseOutputs } from "./whisper/parseOutputs.js";
import { safeBaseName } from "./io/paths.js";

export type TranscribeOptions = {
  input: string;
  language: string;
  formats: string[];
  outDir: string;
  model: string;
  modelPath?: string;
  cacheDir?: string;
  maxFileSizeMb: number;
  timeoutMs: number;
  force: boolean;
  keepTemp: boolean;
  verbose: boolean;
};

export async function transcribe(options: TranscribeOptions) {
  const tempDir = await makeTempDir();

  try {
    await fs.mkdir(options.outDir, { recursive: true });

    const ffmpegPath = await ensureFfmpeg();
    const whisperPath = await ensureWhisper({
      cacheDir: options.cacheDir,
      verbose: options.verbose
    });

    const modelPath =
      options.modelPath ??
      await ensureModel({
        model: options.model,
        cacheDir: options.cacheDir,
        verbose: options.verbose
      });

    const inputFile = await resolveInputToFile({
      input: options.input,
      tempDir,
      maxFileSizeMb: options.maxFileSizeMb,
      verbose: options.verbose
    });

    const wavFile = path.join(tempDir, "input.16k.mono.wav");

    await convertToWav({
      ffmpegPath,
      inputFile,
      outputFile: wavFile,
      verbose: options.verbose
    });

    const baseName = safeBaseName(options.input);
    const outputPrefix = path.join(options.outDir, baseName);

    await runWhisper({
      whisperPath,
      modelPath,
      wavFile,
      language: options.language,
      formats: options.formats,
      outputPrefix,
      timeoutMs: options.timeoutMs,
      force: options.force,
      verbose: options.verbose
    });

    return await parseOutputs({
      outputPrefix,
      formats: options.formats
    });
  } finally {
    if (!options.keepTemp) {
      await cleanupTempDir(tempDir);
    } else {
      console.error(`Temp files kept at: ${tempDir}`);
    }
  }
}
```

---

# 10. Platform detection

## `src/runtime/platform.ts`

```ts
export type SupportedPlatform =
  | "darwin-arm64"
  | "darwin-x64"
  | "linux-x64"
  | "linux-arm64"
  | "win32-x64";

export function getSupportedPlatform(): SupportedPlatform {
  const key = `${process.platform}-${process.arch}`;

  switch (key) {
    case "darwin-arm64":
    case "darwin-x64":
    case "linux-x64":
    case "linux-arm64":
    case "win32-x64":
      return key as SupportedPlatform;
    default:
      throw new Error(
        `Unsupported platform: ${key}. Supported: darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64.`
      );
  }
}
```

---

# 11. Ensure ffmpeg

## `src/runtime/ensureFfmpeg.ts`

```ts
import ffmpegPath from "ffmpeg-static";

export async function ensureFfmpeg(): Promise<string> {
  if (!ffmpegPath) {
    throw new Error(
      "ffmpeg binary was not found. The package dependency ffmpeg-static did not provide a binary for this platform."
    );
  }

  return ffmpegPath;
}
```

---

# 12. Ensure KB-Whisper model

## `src/runtime/ensureModel.ts`

```ts
import path from "node:path";
import fs from "node:fs/promises";
import envPaths from "env-paths";
import { downloadFile } from "../io/download.js";
import { sha256File } from "./checksums.js";

const DEFAULT_CACHE = envPaths("kb-whisper-transcribe").cache;

const MODELS = {
  "kb-whisper-large-q5_0": {
    fileName: "ggml-model-q5_0.bin",
    url: "https://huggingface.co/KBLab/kb-whisper-large/resolve/main/ggml-model-q5_0.bin",
    sha256: "REPLACE_WITH_REAL_SHA256"
  }
} as const;

export async function ensureModel(options: {
  model: string;
  cacheDir?: string;
  verbose?: boolean;
}): Promise<string> {
  const model = MODELS[options.model as keyof typeof MODELS];

  if (!model) {
    throw new Error(`Unknown model: ${options.model}`);
  }

  const root = options.cacheDir ?? DEFAULT_CACHE;
  const modelDir = path.join(root, "models", options.model);
  const modelPath = path.join(modelDir, model.fileName);

  if (await fileExists(modelPath)) {
    await verifySha(modelPath, model.sha256);
    return modelPath;
  }

  await fs.mkdir(modelDir, { recursive: true });

  const tmpPath = `${modelPath}.tmp`;

  if (options.verbose) {
    console.error(`Downloading model ${options.model}...`);
  }

  await downloadFile({
    url: model.url,
    outputPath: tmpPath,
    maxBytes: 10 * 1024 * 1024 * 1024,
    allowPrivateIp: false
  });

  await verifySha(tmpPath, model.sha256);
  await fs.rename(tmpPath, modelPath);

  return modelPath;
}

async function verifySha(file: string, expected: string) {
  if (!expected || expected.startsWith("REPLACE_")) {
    return;
  }

  const actual = await sha256File(file);

  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${file}. Expected ${expected}, got ${actual}.`);
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
```

Before release, calculate SHA:

```bash
shasum -a 256 ggml-model-q5_0.bin
```

---

# 13. Ensure whisper.cpp binary

## `src/runtime/ensureWhisper.ts`

```ts
import path from "node:path";
import fs from "node:fs/promises";
import envPaths from "env-paths";
import tar from "tar";
import { getSupportedPlatform } from "./platform.js";
import { downloadFile } from "../io/download.js";
import { sha256File } from "./checksums.js";

const DEFAULT_CACHE = envPaths("kb-whisper-transcribe").cache;

const RUNTIME_VERSION = "whispercpp-2026-05-30-a1b2c3d";

const RUNTIME_MANIFEST_URL =
  "https://github.com/YOUR_ORG/kb-whisper-transcribe/releases/download/runtime-whispercpp-2026-05-30-a1b2c3d/runtime-manifest.json";

type RuntimeManifest = {
  version: string;
  assets: Record<string, {
    url: string;
    sha256: string;
    binary: string;
  }>;
};

export async function ensureWhisper(options: {
  cacheDir?: string;
  verbose?: boolean;
}): Promise<string> {
  const platform = getSupportedPlatform();
  const root = options.cacheDir ?? DEFAULT_CACHE;

  const runtimeDir = path.join(root, "runtimes", "whisper.cpp", RUNTIME_VERSION, platform);
  const binaryName = platform.startsWith("win32") ? "whisper-cli.exe" : "whisper-cli";
  const binaryPath = path.join(runtimeDir, binaryName);

  if (await fileExists(binaryPath)) {
    return binaryPath;
  }

  await fs.mkdir(runtimeDir, { recursive: true });

  if (options.verbose) {
    console.error(`Downloading whisper.cpp runtime for ${platform}...`);
  }

  const manifestPath = path.join(runtimeDir, "runtime-manifest.json");

  await downloadFile({
    url: RUNTIME_MANIFEST_URL,
    outputPath: manifestPath,
    maxBytes: 5 * 1024 * 1024,
    allowPrivateIp: false
  });

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as RuntimeManifest;
  const asset = manifest.assets[platform];

  if (!asset) {
    throw new Error(`No whisper.cpp runtime asset for platform ${platform}`);
  }

  const archivePath = path.join(runtimeDir, path.basename(asset.url));

  await downloadFile({
    url: asset.url,
    outputPath: archivePath,
    maxBytes: 200 * 1024 * 1024,
    allowPrivateIp: false
  });

  const actualSha = await sha256File(archivePath);
  if (asset.sha256 && actualSha !== asset.sha256) {
    throw new Error(`Runtime checksum mismatch. Expected ${asset.sha256}, got ${actualSha}.`);
  }

  if (archivePath.endsWith(".tar.gz")) {
    await tar.x({
      file: archivePath,
      cwd: runtimeDir
    });
  } else {
    throw new Error("ZIP extraction for Windows runtime needs to be implemented.");
  }

  if (!platform.startsWith("win32")) {
    await fs.chmod(binaryPath, 0o755);
  }

  if (!(await fileExists(binaryPath))) {
    throw new Error(`Runtime archive did not contain expected binary: ${binaryName}`);
  }

  return binaryPath;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
```

For Windows ZIP extraction, add `extract-zip` or publish `.tar.gz` for all platforms and avoid ZIP.

---

# 14. Download handling

## `src/io/download.ts`

```ts
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { isProbablyUrl, validatePublicUrl } from "./ssrf.js";

export async function resolveInputToFile(options: {
  input: string;
  tempDir: string;
  maxFileSizeMb: number;
  verbose?: boolean;
}): Promise<string> {
  if (isProbablyUrl(options.input)) {
    const url = await validatePublicUrl(options.input);
    const outputPath = path.join(options.tempDir, inferInputFileName(url));

    if (options.verbose) {
      console.error(`Downloading input audio...`);
    }

    await downloadFile({
      url: url.toString(),
      outputPath,
      maxBytes: options.maxFileSizeMb * 1024 * 1024,
      allowPrivateIp: false
    });

    return outputPath;
  }

  const localPath = path.resolve(options.input);
  await fsp.access(localPath);
  return localPath;
}

export async function downloadFile(options: {
  url: string;
  outputPath: string;
  maxBytes: number;
  allowPrivateIp: boolean;
}): Promise<void> {
  const response = await fetch(options.url, {
    redirect: "follow"
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${options.url}: HTTP ${response.status}`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > options.maxBytes) {
    throw new Error(`Download too large: ${contentLength} bytes`);
  }

  let downloaded = 0;

  const limitStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      downloaded += chunk.byteLength;

      if (downloaded > options.maxBytes) {
        controller.error(new Error(`Download exceeded max size of ${options.maxBytes} bytes`));
        return;
      }

      controller.enqueue(chunk);
    }
  });

  await fsp.mkdir(path.dirname(options.outputPath), { recursive: true });

  const limitedBody = response.body.pipeThrough(limitStream);
  await pipeline(
    Readable.fromWeb(limitedBody as never),
    fs.createWriteStream(options.outputPath)
  );
}

function inferInputFileName(url: URL): string {
  const base = path.basename(url.pathname) || "input.audio";
  return base.replace(/[^\w.\-]+/g, "_");
}
```

For production-grade SSRF defense, replace plain `fetch` with `undici` and a custom DNS lookup that rejects private IPs at connect time, not just before fetch.

---

# 15. Basic URL validation

## `src/io/ssrf.ts`

```ts
import dns from "node:dns/promises";
import net from "node:net";

export function isProbablyUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

export async function validatePublicUrl(value: string): Promise<URL> {
  const url = new URL(value);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }

  const addresses = await dns.lookup(url.hostname, { all: true });

  for (const address of addresses) {
    if (isPrivateIp(address.address)) {
      throw new Error(`Refusing to download from private IP: ${address.address}`);
    }
  }

  return url;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;

    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();

    return (
      normalized === "::1" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd")
    );
  }

  return true;
}
```

This is acceptable for v0.1, but a hardened hosted service should validate the actual socket destination too.

---

# 16. Audio conversion

## `src/audio/convertToWav.ts`

```ts
import { spawn } from "node:child_process";

export async function convertToWav(options: {
  ffmpegPath: string;
  inputFile: string;
  outputFile: string;
  verbose?: boolean;
}): Promise<void> {
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    options.verbose ? "info" : "error",
    "-i",
    options.inputFile,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    options.outputFile
  ];

  await runProcess(options.ffmpegPath, args, {
    label: "ffmpeg",
    verbose: options.verbose
  });
}

function runProcess(
  command: string,
  args: string[],
  options: { label: string; verbose?: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.verbose ? "inherit" : ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    child.stderr?.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${options.label} failed with exit code ${code}: ${stderr}`));
      }
    });
  });
}
```

---

# 17. Run whisper.cpp

## `src/whisper/runWhisper.ts`

```ts
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

export async function runWhisper(options: {
  whisperPath: string;
  modelPath: string;
  wavFile: string;
  language: string;
  formats: string[];
  outputPrefix: string;
  timeoutMs: number;
  force: boolean;
  verbose?: boolean;
}): Promise<void> {
  await assertOutputsDoNotExistUnlessForce(
    options.outputPrefix,
    options.formats,
    options.force
  );

  const args = [
    "-m",
    options.modelPath,
    "-l",
    options.language,
    "-of",
    options.outputPrefix
  ];

  for (const format of options.formats) {
    if (format === "txt") args.push("-otxt");
    else if (format === "json") args.push("-oj");
    else if (format === "srt") args.push("-osrt");
    else if (format === "vtt") args.push("-ovtt");
    else throw new Error(`Unsupported output format: ${format}`);
  }

  args.push(options.wavFile);

  await runProcess(options.whisperPath, args, {
    label: "whisper-cli",
    timeoutMs: options.timeoutMs,
    verbose: options.verbose
  });
}

async function assertOutputsDoNotExistUnlessForce(
  prefix: string,
  formats: string[],
  force: boolean
): Promise<void> {
  if (force) return;

  for (const format of formats) {
    const ext = format === "json" ? "json" : format;
    const file = `${prefix}.${ext}`;

    try {
      await fs.access(file);
      throw new Error(`Output file already exists: ${file}. Use --force to overwrite.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }
}

function runProcess(
  command: string,
  args: string[],
  options: { label: string; timeoutMs: number; verbose?: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.verbose ? "inherit" : ["ignore", "pipe", "pipe"]
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${options.label} timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    let stderr = "";

    child.stderr?.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", code => {
      clearTimeout(timer);

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${options.label} failed with exit code ${code}: ${stderr}`));
      }
    });
  });
}
```

---

# 18. Parse output files

## `src/whisper/parseOutputs.ts`

```ts
import fs from "node:fs/promises";

export async function parseOutputs(options: {
  outputPrefix: string;
  formats: string[];
}) {
  const files: Record<string, string> = {};
  const content: Record<string, string> = {};

  for (const format of options.formats) {
    const file = `${options.outputPrefix}.${format}`;

    files[format] = file;

    try {
      content[format] = await fs.readFile(file, "utf8");
    } catch {
      // Some whisper.cpp versions may use .json for -oj and exact extension for others.
      // Keep this tolerant.
    }
  }

  return {
    files,
    content
  };
}
```

---

# 19. Safe file naming

## `src/io/paths.ts`

```ts
import path from "node:path";

export function safeBaseName(input: string): string {
  let raw = "transcript";

  try {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      const url = new URL(input);
      raw = path.basename(url.pathname) || "transcript";
    } else {
      raw = path.basename(input);
    }
  } catch {
    raw = "transcript";
  }

  raw = raw.replace(/\.[^.]+$/, "");
  raw = raw.replace(/[^\w.-]+/g, "_");

  return raw || "transcript";
}
```

---

# 20. Temp directory

## `src/io/temp.ts`

```ts
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export async function makeTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "kb-whisper-"));
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await fs.rm(dir, {
    recursive: true,
    force: true
  });
}
```

---

# 21. Checksums

## `src/runtime/checksums.ts`

```ts
import fs from "node:fs";
import crypto from "node:crypto";

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);

    stream.on("data", chunk => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
```

---

# 22. Build whisper.cpp runtime in GitHub Actions

## `.github/workflows/build-runtime.yml`

```yaml
name: Build whisper.cpp runtime

on:
  workflow_dispatch:
    inputs:
      runtime_version:
        description: "Runtime version, e.g. whispercpp-2026-05-30-a1b2c3d"
        required: true
  push:
    tags:
      - "runtime-*"

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: darwin-arm64
            os: macos-14
            archive: whisper-cli-darwin-arm64.tar.gz
          - platform: darwin-x64
            os: macos-13
            archive: whisper-cli-darwin-x64.tar.gz
          - platform: linux-x64
            os: ubuntu-22.04
            archive: whisper-cli-linux-x64.tar.gz
          - platform: win32-x64
            os: windows-2022
            archive: whisper-cli-win32-x64.tar.gz

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Checkout whisper.cpp
        uses: actions/checkout@v4
        with:
          repository: ggml-org/whisper.cpp
          path: whisper.cpp
          ref: master

      - name: Configure
        shell: bash
        run: |
          cd whisper.cpp
          cmake -B build \
            -DWHISPER_BUILD_TESTS=OFF \
            -DWHISPER_BUILD_EXAMPLES=OFF

      - name: Build
        shell: bash
        run: |
          cd whisper.cpp
          cmake --build build --config Release --target whisper-cli

      - name: Package
        shell: bash
        run: |
          mkdir -p dist
          if [[ "${{ runner.os }}" == "Windows" ]]; then
            cp whisper.cpp/build/bin/Release/whisper-cli.exe dist/
          else
            cp whisper.cpp/build/bin/whisper-cli dist/
            chmod +x dist/whisper-cli
          fi

          tar -czf "${{ matrix.archive }}" -C dist .

      - name: SHA256
        shell: bash
        run: |
          shasum -a 256 "${{ matrix.archive }}" > "${{ matrix.archive }}.sha256"

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.archive }}
          path: |
            ${{ matrix.archive }}
            ${{ matrix.archive }}.sha256
```

Then create a second job or manual script that:

1. Downloads all build artifacts.
2. Creates `runtime-manifest.json`.
3. Publishes a GitHub Release named `runtime-whispercpp-...`.

For `linux-arm64`, add a GitHub ARM runner or use cross-compilation later.

---

# 23. CI workflow

## `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-22.04

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm run build
      - run: npm test
```

---

# 24. Publish to NPM from GitHub

For `npx kb-whisper-transcribe`, publish to the public NPM registry, not only GitHub Packages. GitHub Packages often requires authentication and is worse for a public `npx` UX.

## `.github/workflows/publish-npm.yml`

```yaml
name: Publish NPM

on:
  release:
    types:
      - published

jobs:
  publish:
    if: startsWith(github.event.release.tag_name, 'v')
    runs-on: ubuntu-22.04

    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: "https://registry.npmjs.org"
          cache: npm

      - run: npm ci
      - run: npm run build
      - run: npm publish --access public
```

Use NPM trusted publishing if configured. Otherwise set `NPM_TOKEN` as a GitHub secret and use it with `NODE_AUTH_TOKEN`.

---

# 25. README usage

Your README should have this at the top:

````md
# kb-whisper-transcribe

Zero-setup Swedish transcription from a URL or local file.

## Usage

```bash
npx kb-whisper-transcribe \
  "https://bucket.s3.amazonaws.com/audio.mp3" \
  --language sv \
  --format txt,json,srt \
  --out ./transcripts
````

First run downloads:

* whisper.cpp runtime binary
* KB-Whisper GGML model
* ffmpeg binary via package dependency

Later runs reuse the local cache.

## Output

```text
./transcripts/audio.txt
./transcripts/audio.json
./transcripts/audio.srt
```

````

Also include:

```md
## Requirements

Node.js 20+.

No Python, Homebrew, CMake, or manual model download required.

## License notes

This package wraps:
- KB-Whisper model files from KBLab
- whisper.cpp
- ffmpeg

Review upstream licenses before commercial redistribution.
````

---

# 26. Error handling standards

Use clear error messages:

```text
Unsupported platform: linux-armv7.
Supported platforms: darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64.
```

```text
Could not download model. Check your network connection or pass --model-path /path/to/ggml-model-q5_0.bin.
```

```text
Input download exceeded --max-file-size-mb=1000.
```

```text
Output file already exists: ./transcripts/audio.txt. Use --force to overwrite.
```

```text
ffmpeg failed to decode the input file. Try converting it manually or verify that the URL points to a valid audio/video file.
```

---

# 27. Security defaults

Since the CLI accepts remote URLs:

```text
- allow only http/https
- reject private IP ranges by default
- reject localhost
- reject AWS/GCP/Azure metadata IPs
- enforce max file size
- enforce timeout
- use random temp directories
- never use shell string commands
- use spawn(command, args)
- verify checksums for model and runtime binaries
```

For local CLI usage, this is already better than most tools. For a future hosted service, harden DNS and redirect handling further.

---

# 28. Implementation order

Build it in this order:

1. Implement local file transcription only.
2. Add `ffmpeg-static` conversion.
3. Add model auto-download and cache.
4. Add URL download.
5. Add output formats.
6. Add GitHub Action for Mac ARM `whisper-cli`.
7. Add runtime auto-download.
8. Test `npx` locally with `npm pack`.
9. Publish `0.1.0`.
10. Add Linux/Windows runtimes.

Local publish simulation:

```bash
npm run build
npm pack
npx ./kb-whisper-transcribe-0.1.0.tgz ./audio.mp3 \
  --language sv \
  --format txt,json,srt \
  --out ./transcripts
```

---

# 29. v0.1 scope

Ship this first:

```text
- public/presigned HTTPS URL input
- local file input
- Swedish default: --language sv
- txt/json/srt/vtt outputs
- model cache
- runtime cache
- ffmpeg-static conversion
- darwin-arm64 support
- clear unsupported-platform errors
```

Then v0.2:

```text
- linux-x64
- linux-arm64
- win32-x64
- native s3:// support
- progress events
- library API
- batch mode
```

Then v0.3:

```text
- diarization
- word timestamps
- queue/server mode
- hosted worker reference deployment
```

---

# 30. Final recommendation

Implement this as a **thin, reliable TypeScript CLI around prebuilt `whisper.cpp` + cached KB-Whisper model**.

Do not attempt native Node bindings yet. Do not compile anything on install. Do not bundle the model in NPM. The winning developer experience is:

```bash
npx kb-whisper-transcribe "https://..." --language sv --format txt,json,srt --out ./transcripts
```

Internally, it can download and cache several hundred MB on first run, but from the user’s perspective, Node.js is the only prerequisite.

[1]: https://huggingface.co/KBLab/kb-whisper-large?utm_source=chatgpt.com "KBLab/kb-whisper-large"
[2]: https://www.ffmpeg.org/legal.html?utm_source=chatgpt.com "FFmpeg License and Legal Considerations"
