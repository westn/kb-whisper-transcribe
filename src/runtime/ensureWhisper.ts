import envPaths from "env-paths";
import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";
import { UserFacingError } from "../errors.js";
import { downloadFile } from "../io/download.js";
import { sha256File } from "./checksums.js";
import { withFileLock } from "./lock.js";
import { getSupportedPlatform } from "./platform.js";
import { DEFAULT_RUNTIME_MANIFEST_URL, RUNTIME_VERSION, type RuntimeManifest } from "./runtimeManifest.js";

const DEFAULT_CACHE = envPaths("kb-whisper-transcribe").cache;

export async function ensureWhisper(options: { cacheDir?: string; verbose?: boolean; whisperPath?: string }): Promise<string> {
  if (options.whisperPath) return assertExecutable(options.whisperPath);
  if (process.env.WHISPER_CPP_PATH) return assertExecutable(process.env.WHISPER_CPP_PATH);

  const platform = getSupportedPlatform();
  const root = options.cacheDir ?? DEFAULT_CACHE;
  const runtimeDir = path.join(root, "runtimes", "whisper.cpp", RUNTIME_VERSION, platform);
  const binaryName = platform.startsWith("win32") ? "whisper-cli.exe" : "whisper-cli";
  const binaryPath = path.join(runtimeDir, binaryName);
  if (await fileExists(binaryPath)) return binaryPath;
  await fs.mkdir(runtimeDir, { recursive: true });

  return withFileLock(path.join(runtimeDir, ".lock"), async () => {
    if (await fileExists(binaryPath)) return binaryPath;
    if (options.verbose) console.error(`Downloading whisper.cpp runtime for ${platform}...`);
    const manifestPath = path.join(runtimeDir, "runtime-manifest.json");
    await downloadFile({ url: DEFAULT_RUNTIME_MANIFEST_URL, outputPath: manifestPath, maxBytes: 5 * 1024 * 1024, allowPrivateIp: false });
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as RuntimeManifest;
    const asset = manifest.assets[platform];
    if (!asset) throw new UserFacingError(`No whisper.cpp runtime asset for platform ${platform} in manifest ${manifest.version}`);
    const archivePath = path.join(runtimeDir, path.basename(new URL(asset.url).pathname));
    await downloadFile({ url: asset.url, outputPath: archivePath, maxBytes: 300 * 1024 * 1024, allowPrivateIp: false });
    const actualSha = await sha256File(archivePath);
    if (asset.sha256 && actualSha !== asset.sha256) throw new UserFacingError(`Runtime checksum mismatch. Expected ${asset.sha256}, got ${actualSha}.`);
    await tar.x({ file: archivePath, cwd: runtimeDir });
    if (!platform.startsWith("win32")) await fs.chmod(binaryPath, 0o755).catch(() => undefined);
    if (!(await fileExists(binaryPath))) throw new UserFacingError(`Runtime archive did not contain expected binary: ${binaryName}`);
    return binaryPath;
  });
}

async function assertExecutable(file: string): Promise<string> {
  try { await fs.access(file); return file; } catch { throw new UserFacingError(`whisper.cpp binary not found: ${file}`); }
}
async function fileExists(file: string): Promise<boolean> { try { await fs.access(file); return true; } catch { return false; } }
