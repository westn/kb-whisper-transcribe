import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UserFacingError } from "../errors.js";
import { isProbablyUrl, validatePublicUrl } from "./ssrf.js";

export async function resolveInputToFile(options: { input: string; tempDir: string; maxFileSizeMb: number; verbose?: boolean }): Promise<string> {
  if (isProbablyUrl(options.input)) {
    const url = await validatePublicUrl(options.input);
    const outputPath = path.join(options.tempDir, inferInputFileName(url));
    if (options.verbose) console.error(`Downloading input audio from ${url.hostname}...`);
    await downloadFile({ url: url.toString(), outputPath, maxBytes: options.maxFileSizeMb * 1024 * 1024, allowPrivateIp: false });
    return outputPath;
  }
  const localPath = path.resolve(options.input);
  const stat = await fsp.stat(localPath).catch(() => { throw new UserFacingError(`Input file not found: ${localPath}`); });
  if (!stat.isFile()) throw new UserFacingError(`Input path is not a file: ${localPath}`);
  return localPath;
}

export async function downloadFile(options: { url: string; outputPath: string; maxBytes: number; allowPrivateIp?: boolean }): Promise<void> {
  const response = await fetchWithValidatedRedirects(options.url, Boolean(options.allowPrivateIp));
  if (!response.ok || !response.body) throw new UserFacingError(`Failed to download ${options.url}: HTTP ${response.status}`);
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > options.maxBytes) throw new UserFacingError(`Download too large: ${contentLength} bytes (limit ${options.maxBytes})`);
  let downloaded = 0;
  const limitStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      downloaded += chunk.byteLength;
      if (downloaded > options.maxBytes) controller.error(new UserFacingError(`Download exceeded max size of ${options.maxBytes} bytes`));
      else controller.enqueue(chunk);
    }
  });
  await fsp.mkdir(path.dirname(options.outputPath), { recursive: true });
  const tmp = `${options.outputPath}.download`;
  try {
    await pipeline(Readable.fromWeb(response.body.pipeThrough(limitStream) as any), fs.createWriteStream(tmp));
    await fsp.rename(tmp, options.outputPath);
  } catch (error) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function fetchWithValidatedRedirects(url: string, allowPrivateIp: boolean): Promise<Response> {
  let current = url;
  for (let redirectCount = 0; redirectCount <= 10; redirectCount += 1) {
    if (!allowPrivateIp) await validatePublicUrl(current);
    const response = await fetch(current, { redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new UserFacingError(`Redirect from ${current} did not include a Location header.`);
    current = new URL(location, current).toString();
  }
  throw new UserFacingError(`Too many redirects while downloading ${url}`);
}

function inferInputFileName(url: URL): string {
  const base = path.basename(url.pathname) || "input.audio";
  return base.replace(/[^\w.-]+/g, "_") || "input.audio";
}
