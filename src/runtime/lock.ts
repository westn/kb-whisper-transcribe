import fs from "node:fs/promises";

export async function withFileLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx");
      try {
        await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
        return await fn();
      } finally {
        await handle.close();
        await fs.rm(lockPath, { force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() - started > 30 * 60 * 1000) throw new Error(`Timed out waiting for lock: ${lockPath}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
