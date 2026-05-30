#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { transcribe } from "./transcribe.js";

const program = new Command();

program
  .name("kb-whisper-transcribe")
  .description("Zero-setup Swedish transcription using KB-Whisper and whisper.cpp")
  .argument("<input>", "Audio URL or local file path")
  .option("--language <code>", "Language code", "sv")
  .option("--format <list>", "Comma-separated output formats: txt,json,srt,vtt", parseFormats, ["txt"])
  .option("--out <dir>", "Output directory", "./transcripts")
  .option("--model <name>", "Model name", "kb-whisper-large-q5_0")
  .option("--model-path <path>", "Use a local GGML model file")
  .option("--cache-dir <dir>", "Override cache directory")
  .option("--max-file-size-mb <n>", "Maximum input download size", parsePositiveNumber, 1000)
  .option("--timeout-ms <n>", "Transcription timeout in ms", parsePositiveNumber, 1_800_000)
  .option("--whisper-path <path>", "Use a local whisper-cli binary instead of the cached runtime")
  .option("--ffmpeg-path <path>", "Use a local ffmpeg binary instead of ffmpeg-static")
  .option("--force", "Overwrite existing output files", false)
  .option("--keep-temp", "Keep temporary files", false)
  .option("--verbose", "Verbose logs", false)
  .action(async (input: string, options) => {
    try {
      const result = await transcribe({
        input,
        language: options.language,
        formats: options.format,
        outDir: options.out,
        model: options.model,
        modelPath: options.modelPath,
        cacheDir: options.cacheDir,
        maxFileSizeMb: options.maxFileSizeMb,
        timeoutMs: options.timeoutMs,
        force: Boolean(options.force),
        keepTemp: Boolean(options.keepTemp),
        verbose: Boolean(options.verbose),
        whisperPath: options.whisperPath,
        ffmpegPath: options.ffmpegPath,
      });
      console.log("✓ Transcript written");
      for (const [format, file] of Object.entries(result.files)) console.log(`  ${format}: ${file}`);
    } catch (error) {
      console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  });

function parseFormats(value: string): string[] {
  const formats = value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (formats.length === 0) throw new InvalidArgumentError("At least one format is required.");
  return formats;
}

function parsePositiveNumber(value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new InvalidArgumentError("Must be a positive number.");
  return number;
}

await program.parseAsync();
