import envPaths from "env-paths";
import fs from "node:fs/promises";
import path from "node:path";
import { UserFacingError } from "../errors.js";
import { downloadFile } from "../io/download.js";
import { sha256File } from "./checksums.js";
import { withFileLock } from "./lock.js";
import { MODELS } from "./models.js";

const DEFAULT_CACHE = envPaths("kb-whisper-transcribe").cache;

export async function ensureModel(options: { model: string; cacheDir?: string; verbose?: boolean }): Promise<string> {
  const model = MODELS[options.model as keyof typeof MODELS];
  if (!model) throw new UserFacingError(`Unknown model: ${options.model}. Available: ${Object.keys(MODELS).join(", ")}`);
  const modelDir = path.join(options.cacheDir ?? DEFAULT_CACHE, "models", options.model);
  const modelPath = path.join(modelDir, model.fileName);
  await fs.mkdir(modelDir, { recursive: true });
  if (await validExisting(modelPath, model.sha256)) return modelPath;
  return withFileLock(path.join(modelDir, ".lock"), async () => {
    if (await validExisting(modelPath, model.sha256)) return modelPath;
    const tmpPath = `${modelPath}.tmp`;
    if (options.verbose) console.error(`Downloading model ${options.model} (this can take a while)...`);
    await fs.rm(tmpPath, { force: true });
    await downloadFile({ url: model.url, outputPath: tmpPath, maxBytes: 10 * 1024 * 1024 * 1024, allowPrivateIp: false });
    await verifySha(tmpPath, model.sha256);
    await fs.rename(tmpPath, modelPath);
    return modelPath;
  });
}

async function validExisting(file: string, expected: string): Promise<boolean> {
  try { await fs.access(file); } catch { return false; }
  await verifySha(file, expected);
  return true;
}

async function verifySha(file: string, expected: string): Promise<void> {
  const actual = await sha256File(file);
  if (actual !== expected) throw new UserFacingError(`Checksum mismatch for ${file}. Expected ${expected}, got ${actual}. Delete the file and retry if the download was interrupted.`);
}
