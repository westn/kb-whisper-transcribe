import path from "node:path";

export function safeBaseName(input: string): string {
  let raw = "transcript";
  try {
    if (input.startsWith("http://") || input.startsWith("https://")) raw = decodeURIComponent(path.basename(new URL(input).pathname)) || "transcript";
    else raw = path.basename(input);
  } catch { raw = "transcript"; }
  raw = raw.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").replace(/^\.+$/, "");
  return raw || "transcript";
}

export function outputExtension(format: string): string {
  return format === "json" ? "json" : format;
}
