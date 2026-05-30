export type RuntimeAsset = { url: string; sha256: string; binary: string };
export type RuntimeManifest = { version: string; assets: Record<string, RuntimeAsset> };

export const RUNTIME_VERSION = "whispercpp-runtime-v0.1.0";
export const DEFAULT_RUNTIME_MANIFEST_URL =
  process.env.KB_WHISPER_RUNTIME_MANIFEST_URL ??
  "https://github.com/westn/kb-whisper-transcribe/releases/download/whispercpp-runtime-v0.1.0/runtime-manifest.json";
