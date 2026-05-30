import fs from "node:fs/promises";
import { outputExtension } from "../io/paths.js";

export type ParsedOutputs = { files: Record<string, string>; content: Record<string, string> };

export async function parseOutputs(options: { outputPrefix: string; formats: string[] }): Promise<ParsedOutputs> {
  const files: Record<string, string> = {};
  const content: Record<string, string> = {};
  for (const format of options.formats) {
    const file = `${options.outputPrefix}.${outputExtension(format)}`;
    files[format] = file;
    try { content[format] = await fs.readFile(file, "utf8"); } catch { /* output existence is checked by caller/user */ }
  }
  return { files, content };
}
