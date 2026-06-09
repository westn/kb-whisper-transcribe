import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { UserFacingError } from "../errors.js";

export async function hasCurl(): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn("curl", ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", code => resolve(code === 0));
  });
}

export async function downloadFileWithCurl(options: { url: string; outputPath: string; verbose?: boolean }): Promise<void> {
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  const partialPath = `${options.outputPath}.download`;
  const args = [
    "--fail",
    "--location",
    "--show-error",
    "--retry", "8",
    "--retry-delay", "2",
    "--retry-max-time", "0",
    "--connect-timeout", "30",
    "--continue-at", "-",
    "--output", partialPath,
    options.url
  ];

  if (options.verbose) console.error(`Downloading with curl to ${partialPath}...`);

  await new Promise<void>((resolve, reject) => {
    const stderr: Buffer[] = [];
    const child = spawn("curl", args, {
      stdio: ["ignore", "ignore", "pipe"]
    });
    child.stderr.on("data", chunk => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) resolve();
      else reject(new UserFacingError(`curl failed with exit code ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
    });
  });

  await fs.rename(partialPath, options.outputPath);
}
