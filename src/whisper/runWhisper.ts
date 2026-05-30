import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { UserFacingError } from "../errors.js";
import { outputExtension } from "../io/paths.js";

const FORMAT_FLAGS: Record<string, string> = { txt: "-otxt", json: "-oj", srt: "-osrt", vtt: "-ovtt" };

export async function runWhisper(options: { whisperPath: string; modelPath: string; wavFile: string; language: string; formats: string[]; outputPrefix: string; timeoutMs: number; force: boolean; verbose?: boolean }): Promise<void> {
  await assertOutputsDoNotExistUnlessForce(options.outputPrefix, options.formats, options.force);
  const args = ["-m", options.modelPath, "-l", options.language, "-of", options.outputPrefix];
  for (const format of options.formats) {
    const flag = FORMAT_FLAGS[format];
    if (!flag) throw new UserFacingError(`Unsupported output format: ${format}. Supported: ${Object.keys(FORMAT_FLAGS).join(", ")}`);
    args.push(flag);
  }
  args.push(options.wavFile);
  await runProcess(options.whisperPath, args, { label: "whisper-cli", timeoutMs: options.timeoutMs, verbose: options.verbose });
}

async function assertOutputsDoNotExistUnlessForce(prefix: string, formats: string[], force: boolean): Promise<void> {
  if (force) return;
  for (const format of formats) {
    const file = `${prefix}.${outputExtension(format)}`;
    try { await fs.access(file); throw new UserFacingError(`Output file already exists: ${file}. Use --force to overwrite.`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

function runProcess(command: string, args: string[], options: { label: string; timeoutMs: number; verbose?: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.verbose ? "inherit" : ["ignore", "pipe", "pipe"] });
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`${options.label} timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);
    let stderr = "";
    child.stderr?.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.on("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${options.label} failed with exit code ${code}: ${stderr.trim()}`));
    });
  });
}
