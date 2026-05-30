import dns from "node:dns/promises";
import net from "node:net";
import { UserFacingError } from "../errors.js";

export function isProbablyUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

export async function validatePublicUrl(value: string): Promise<URL> {
  let url: URL;
  try { url = new URL(value); } catch { throw new UserFacingError(`Invalid URL: ${value}`); }
  if (!["http:", "https:"].includes(url.protocol)) throw new UserFacingError(`Unsupported URL protocol: ${url.protocol}`);
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new UserFacingError(`Could not resolve host: ${url.hostname}`);
  for (const address of addresses) {
    if (isPrivateIp(address.address)) throw new UserFacingError(`Refusing to download from private or local address: ${address.address}`);
  }
  return url;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const n = ip.toLowerCase();
    return n === "::" || n === "::1" || n.startsWith("fe80:") || n.startsWith("fc") || n.startsWith("fd") || n.startsWith("ff");
  }
  return true;
}
