import { UserFacingError } from "../errors.js";

export type SupportedPlatform = "darwin-arm64" | "darwin-x64" | "linux-x64" | "linux-arm64" | "win32-x64";

export function getSupportedPlatform(): SupportedPlatform {
  const key = `${process.platform}-${process.arch}`;
  if (["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "win32-x64"].includes(key)) {
    return key as SupportedPlatform;
  }
  throw new UserFacingError(`Unsupported platform: ${key}. Supported: darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64.`);
}
