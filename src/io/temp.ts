import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "kb-whisper-"));
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
