import ffmpegStatic from "ffmpeg-static";
import { UserFacingError } from "../errors.js";

export async function ensureFfmpeg(): Promise<string> {
  const ffmpegPath = typeof ffmpegStatic === "string" ? ffmpegStatic : (ffmpegStatic as unknown as { default?: string | null }).default;
  if (!ffmpegPath) throw new UserFacingError("ffmpeg binary was not found for this platform.");
  return ffmpegPath;
}
