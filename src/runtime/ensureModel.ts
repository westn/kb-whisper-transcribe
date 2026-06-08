import envPaths from "env-paths";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { UserFacingError } from "../errors.js";
import { downloadFile } from "../io/download.js";
import { sha256File } from "./checksums.js";
import { withFileLock } from "./lock.js";
import { MODELS } from "./models.js";

const DEFAULT_CACHE = envPaths("kb-whisper-transcribe").cache;
const MODEL_DOWNLOAD_ATTEMPTS = 3;

export async function ensureModel(options: { model: string; cacheDir?: string; verbose?: boolean }): Promise<string> {
  const model = MODELS[options.model as keyof typeof MODELS];
  if (!model) throw new UserFacingError(`Unknown model: ${options.model}. Available: ${Object.keys(MODELS).join(", ")}`);
  const modelDir = path.join(options.cacheDir ?? DEFAULT_CACHE, "models", options.model);
  const modelPath = path.join(modelDir, model.fileName);
  await fs.mkdir(modelDir, { recursive: true });
  if (await validExisting(modelPath, model.sha256, model.sizeBytes, options.verbose)) return modelPath;
  return withFileLock(path.join(modelDir, ".lock"), async () => {
    if (await validExisting(modelPath, model.sha256, model.sizeBytes, options.verbose)) return modelPath;
    const tmpPath = `${modelPath}.tmp`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MODEL_DOWNLOAD_ATTEMPTS; attempt += 1) {
      if (options.verbose) console.error(`Downloading model ${options.model} (attempt ${attempt}/${MODEL_DOWNLOAD_ATTEMPTS}; this can take a while)...`);
      try {
        await fs.rm(tmpPath, { force: true }).catch(() => undefined);
        await downloadFile({
          url: model.url,
          outputPath: tmpPath,
          maxBytes: 10 * 1024 * 1024 * 1024,
          allowPrivateIp: false,
          resumable: true,
          verbose: options.verbose,
        });
        await verifyModelFile(tmpPath, model.sha256, model.sizeBytes);
        await fs.rename(tmpPath, modelPath);
        return modelPath;
      } catch (error) {
        lastError = error;
        await fs.rm(tmpPath, { force: true }).catch(() => undefined);
        if (isVerificationError(error)) await fs.rm(`${tmpPath}.download`, { force: true }).catch(() => undefined);
        if (attempt < MODEL_DOWNLOAD_ATTEMPTS) await sleep(1000 * attempt);
      }
    }
    throw toModelDownloadError(modelPath, lastError);
  });
}

async function validExisting(file: string, expectedSha256: string, expectedSizeBytes: number | undefined, verbose?: boolean): Promise<boolean> {
  try { await fs.access(file); } catch { return false; }
  try {
    await verifyModelFile(file, expectedSha256, expectedSizeBytes);
    return true;
  } catch (error) {
    if (verbose) console.error(`Removing invalid cached model ${file}: ${error instanceof Error ? error.message : String(error)}`);
    await fs.rm(file, { force: true }).catch(() => undefined);
    return false;
  }
}

async function verifyModelFile(file: string, expectedSha256: string, expectedSizeBytes?: number): Promise<void> {
  if (expectedSizeBytes) {
    const stat = await fs.stat(file);
    if (stat.size !== expectedSizeBytes) {
      throw new UserFacingError(`Model download is incomplete for ${file}. Expected ${expectedSizeBytes} bytes, got ${stat.size} bytes.`);
    }
  }
  const actual = await sha256File(file);
  if (actual !== expectedSha256) throw new UserFacingError(`Checksum mismatch for ${file}. Expected ${expectedSha256}, got ${actual}. The corrupt file was removed; retrying will download a fresh copy.`);
}

function isVerificationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Checksum mismatch") || message.includes("Model download is incomplete");
}

function toModelDownloadError(modelPath: string, error: unknown): UserFacingError {
  const message = error instanceof Error ? error.message : String(error);
  return new UserFacingError(`Could not download a verified model to ${modelPath} after ${MODEL_DOWNLOAD_ATTEMPTS} attempts. Last error: ${message}`);
}
