import { describe, expect, it } from "vitest";
import { safeBaseName } from "../src/io/paths.js";
import { isPrivateIp } from "../src/io/ssrf.js";

describe("safeBaseName", () => {
  it("derives names from urls and files safely", () => {
    expect(safeBaseName("https://example.com/a/My Audio.mp3?x=1")).toBe("My_Audio");
    expect(safeBaseName("../hello.wav")).toBe("hello");
    expect(safeBaseName("...")).toBe("transcript");
  });
});

describe("isPrivateIp", () => {
  it("blocks local ranges", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("::1")).toBe(true);
  });
});
