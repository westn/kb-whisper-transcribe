import ffmpegStatic from "ffmpeg-static";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { UserFacingError } from "../errors.js";

export async function ensureFfmpeg(): Promise<string> {
  const configuredPath = process.env.FFMPEG_PATH;
  if (configuredPath) return assertUsableFfmpeg(configuredPath, "FFMPEG_PATH");

  const staticPath = typeof ffmpegStatic === "string" ? ffmpegStatic : (ffmpegStatic as unknown as { default?: string | null }).default;
  if (staticPath && await isUsableFfmpeg(staticPath, true)) return staticPath;

  if (await isUsableFfmpeg("ffmpeg", false)) return "ffmpeg";

  const staticHint = staticPath ? ` ffmpeg-static resolved to ${staticPath}, but that file was not executable.` : " ffmpeg-static did not provide a binary for this platform.";
  throw new UserFacingError(`ffmpeg binary was not found.${staticHint} Install ffmpeg on PATH, set FFMPEG_PATH to an executable ffmpeg binary, or reinstall with ffmpeg-static install scripts enabled.`);
}

async function assertUsableFfmpeg(command: string, source: string): Promise<string> {
  if (await isUsableFfmpeg(command, true)) return command;
  throw new UserFacingError(`${source} points to an unusable ffmpeg binary: ${command}`);
}

async function isUsableFfmpeg(command: string, checkFileAccess: boolean): Promise<boolean> {
  if (checkFileAccess) {
    try { await fs.access(command, fs.constants.X_OK); }
    catch { return false; }
  }

  return new Promise(resolve => {
    const child = spawn(command, ["-version"], { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(false);
    }, 5000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", code => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}
