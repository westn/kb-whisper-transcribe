import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UserFacingError } from "../errors.js";
import { isProbablyUrl, validatePublicUrl } from "./ssrf.js";

const RESUMABLE_CHUNK_BYTES = 64 * 1024 * 1024;

type DownloadOptions = {
  url: string;
  outputPath: string;
  maxBytes: number;
  allowPrivateIp?: boolean;
  resumable?: boolean;
  verbose?: boolean;
};

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

export async function downloadFile(options: DownloadOptions): Promise<void> {
  if (options.resumable) {
    const handled = await tryDownloadFileResumable(options);
    if (handled) return;
  }
  const response = await fetchWithValidatedRedirects(options.url, Boolean(options.allowPrivateIp));
  if (!response.ok || !response.body) throw new UserFacingError(`Failed to download ${options.url}: HTTP ${response.status}`);
  const expectedBytes = parseContentLength(response.headers.get("content-length"));
  if (expectedBytes && expectedBytes > options.maxBytes) throw new UserFacingError(`Download too large: ${expectedBytes} bytes (limit ${options.maxBytes})`);
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
    if (expectedBytes !== null && downloaded !== expectedBytes) {
      throw new UserFacingError(`Download incomplete for ${options.url}: expected ${expectedBytes} bytes, got ${downloaded}`);
    }
    await fsp.rename(tmp, options.outputPath);
  } catch (error) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function tryDownloadFileResumable(options: DownloadOptions): Promise<boolean> {
  const totalBytes = await getRemoteSizeBytes(options.url, Boolean(options.allowPrivateIp));
  if (totalBytes === null) return false;
  if (totalBytes > options.maxBytes) throw new UserFacingError(`Download too large: ${totalBytes} bytes (limit ${options.maxBytes})`);

  await fsp.mkdir(path.dirname(options.outputPath), { recursive: true });
  const partialPath = `${options.outputPath}.download`;
  let downloaded = await getFileSize(partialPath);
  if (downloaded > totalBytes) {
    await fsp.rm(partialPath, { force: true });
    downloaded = 0;
  }

  while (downloaded < totalBytes) {
    const end = Math.min(downloaded + RESUMABLE_CHUNK_BYTES - 1, totalBytes - 1);
    if (options.verbose) console.error(`Downloading bytes ${downloaded}-${end} of ${totalBytes}...`);
    const response = await fetchWithValidatedRedirects(options.url, Boolean(options.allowPrivateIp), {
      headers: { Range: `bytes=${downloaded}-${end}` }
    });
    if (response.status !== 206 || !response.body) {
      if (downloaded === 0) {
        await fsp.rm(partialPath, { force: true }).catch(() => undefined);
        return false;
      }
      throw new UserFacingError(`Server did not honor resumable download range ${downloaded}-${end}: HTTP ${response.status}`);
    }

    const expectedChunkBytes = end - downloaded + 1;
    const responseBytes = parseContentLength(response.headers.get("content-length"));
    if (responseBytes !== null && responseBytes !== expectedChunkBytes) {
      throw new UserFacingError(`Unexpected range size for ${options.url}: expected ${expectedChunkBytes} bytes, got ${responseBytes}`);
    }

    let chunkBytes = 0;
    const countStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        chunkBytes += chunk.byteLength;
        controller.enqueue(chunk);
      }
    });
    await pipeline(Readable.fromWeb(response.body.pipeThrough(countStream) as any), fs.createWriteStream(partialPath, { flags: "a" }));
    if (chunkBytes !== expectedChunkBytes) {
      throw new UserFacingError(`Download chunk incomplete for ${options.url}: expected ${expectedChunkBytes} bytes, got ${chunkBytes}`);
    }
    downloaded += chunkBytes;
  }

  await fsp.rename(partialPath, options.outputPath);
  return true;
}

async function getRemoteSizeBytes(url: string, allowPrivateIp: boolean): Promise<number | null> {
  const response = await fetchWithValidatedRedirects(url, allowPrivateIp, { method: "HEAD" });
  if (!response.ok) return null;
  return parseContentLength(response.headers.get("content-length"));
}

function parseContentLength(contentLength: string | null): number | null {
  const parsed = contentLength ? Number(contentLength) : null;
  return Number.isFinite(parsed) ? parsed : null;
}

async function getFileSize(file: string): Promise<number> {
  const stat = await fsp.stat(file).catch(() => null);
  return stat?.size ?? 0;
}

async function fetchWithValidatedRedirects(url: string, allowPrivateIp: boolean, init: RequestInit = {}): Promise<Response> {
  let current = url;
  for (let redirectCount = 0; redirectCount <= 10; redirectCount += 1) {
    if (!allowPrivateIp) await validatePublicUrl(current);
    const response = await fetch(current, { ...init, redirect: "manual" });
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
