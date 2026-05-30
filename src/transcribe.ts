import fs from "node:fs/promises";
import path from "node:path";
import { convertToWav } from "./audio/convertToWav.js";
import { UserFacingError } from "./errors.js";
import { resolveInputToFile } from "./io/download.js";
import { safeBaseName } from "./io/paths.js";
import { cleanupTempDir, makeTempDir } from "./io/temp.js";
import { ensureFfmpeg } from "./runtime/ensureFfmpeg.js";
import { ensureModel } from "./runtime/ensureModel.js";
import { ensureWhisper } from "./runtime/ensureWhisper.js";
import { parseOutputs, type ParsedOutputs } from "./whisper/parseOutputs.js";
import { runWhisper } from "./whisper/runWhisper.js";

export type OutputFormat = "txt" | "json" | "srt" | "vtt";

export type TranscribeOptions = {
  input: string;
  language?: string;
  formats?: string[];
  outDir?: string;
  model?: string;
  modelPath?: string;
  cacheDir?: string;
  maxFileSizeMb?: number;
  timeoutMs?: number;
  force?: boolean;
  keepTemp?: boolean;
  verbose?: boolean;
  ffmpegPath?: string;
  whisperPath?: string;
};

export type TranscribeResult = ParsedOutputs & { tempDir?: string; outputPrefix: string };

export async function transcribe(rawOptions: TranscribeOptions): Promise<TranscribeResult> {
  const options = normalizeOptions(rawOptions);
  const tempDir = await makeTempDir();
  try {
    await fs.mkdir(options.outDir, { recursive: true });
    const ffmpegPath = options.ffmpegPath ?? await ensureFfmpeg();
    const whisperPath = await ensureWhisper({ cacheDir: options.cacheDir, verbose: options.verbose, whisperPath: options.whisperPath });
    const modelPath = options.modelPath ? path.resolve(options.modelPath) : await ensureModel({ model: options.model, cacheDir: options.cacheDir, verbose: options.verbose });
    if (options.modelPath) await fs.access(modelPath).catch(() => { throw new UserFacingError(`Model file not found: ${modelPath}`); });
    const inputFile = await resolveInputToFile({ input: options.input, tempDir, maxFileSizeMb: options.maxFileSizeMb, verbose: options.verbose });
    const wavFile = path.join(tempDir, "input.16k.mono.wav");
    await convertToWav({ ffmpegPath, inputFile, outputFile: wavFile, verbose: options.verbose });
    const outputPrefix = path.join(path.resolve(options.outDir), safeBaseName(options.input));
    await runWhisper({ whisperPath, modelPath, wavFile, language: options.language, formats: options.formats, outputPrefix, timeoutMs: options.timeoutMs, force: options.force, verbose: options.verbose });
    const parsed = await parseOutputs({ outputPrefix, formats: options.formats });
    return options.keepTemp ? { ...parsed, tempDir, outputPrefix } : { ...parsed, outputPrefix };
  } finally {
    if (!options.keepTemp) await cleanupTempDir(tempDir);
    else console.error(`Temp files kept at: ${tempDir}`);
  }
}

function normalizeOptions(options: TranscribeOptions): Required<Omit<TranscribeOptions, "modelPath" | "cacheDir" | "ffmpegPath" | "whisperPath">> & Pick<TranscribeOptions, "modelPath" | "cacheDir" | "ffmpegPath" | "whisperPath"> {
  if (!options.input) throw new UserFacingError("Missing input audio path or URL.");
  const formats = (options.formats?.length ? options.formats : ["txt"]).map(f => f.trim().toLowerCase()).filter(Boolean);
  const allowed = new Set(["txt", "json", "srt", "vtt"]);
  for (const format of formats) if (!allowed.has(format)) throw new UserFacingError(`Unsupported output format: ${format}. Supported: txt,json,srt,vtt`);
  const maxFileSizeMb = options.maxFileSizeMb ?? 1000;
  const timeoutMs = options.timeoutMs ?? 1_800_000;
  if (!Number.isFinite(maxFileSizeMb) || maxFileSizeMb <= 0) throw new UserFacingError("--max-file-size-mb must be a positive number.");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new UserFacingError("--timeout-ms must be a positive number.");
  return {
    input: options.input,
    language: options.language ?? "sv",
    formats: [...new Set(formats)],
    outDir: options.outDir ?? "./transcripts",
    model: options.model ?? "kb-whisper-large-q5_0",
    modelPath: options.modelPath,
    cacheDir: options.cacheDir,
    maxFileSizeMb,
    timeoutMs,
    force: options.force ?? false,
    keepTemp: options.keepTemp ?? false,
    verbose: options.verbose ?? false,
    ffmpegPath: options.ffmpegPath,
    whisperPath: options.whisperPath,
  };
}
