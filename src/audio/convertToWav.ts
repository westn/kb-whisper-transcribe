import { spawn } from "node:child_process";

export async function convertToWav(options: { ffmpegPath: string; inputFile: string; outputFile: string; verbose?: boolean }): Promise<void> {
  const args = ["-y", "-hide_banner", "-loglevel", options.verbose ? "info" : "error", "-i", options.inputFile, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", options.outputFile];
  await runProcess(options.ffmpegPath, args, { label: "ffmpeg", verbose: options.verbose });
}

function runProcess(command: string, args: string[], options: { label: string; verbose?: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.verbose ? "inherit" : ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`${options.label} failed with exit code ${code}: ${stderr.trim()}`)));
  });
}
