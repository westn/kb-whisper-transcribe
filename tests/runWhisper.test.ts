import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runWhisper } from "../src/whisper/runWhisper.js";

describe("runWhisper", () => {
  it("refuses to overwrite unless forced", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-test-"));
    const prefix = path.join(dir, "audio");
    await fs.writeFile(`${prefix}.txt`, "old");
    await expect(runWhisper({ whisperPath: process.execPath, modelPath: "m", wavFile: "w", language: "sv", formats: ["txt"], outputPrefix: prefix, timeoutMs: 1000, force: false })).rejects.toThrow(/already exists/);
  });
});
