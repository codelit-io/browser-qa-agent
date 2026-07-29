import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function normalizeHost(host) {
  return host.toLowerCase().replace(/\.$/, "");
}

export function isPrivateAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  }
  return version === 0;
}

export function inspectRequest(rawUrl, method, options) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (["data:", "blob:", "about:"].includes(url.protocol)) return { ok: true, url, network: false };
  if (!["http:", "https:"].includes(url.protocol)) return { ok: false, reason: "unsupported protocol" };
  if (url.username || url.password) return { ok: false, reason: "credentials in URL are not allowed" };
  if (url.protocol !== "https:" && !options.allowHttp) return { ok: false, reason: "HTTP requires --allow-http" };
  const host = normalizeHost(url.hostname);
  if (!options.allowedHosts.has(host)) return { ok: false, reason: "host is outside the allowlist" };
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return { ok: false, reason: "state-changing request method blocked" };
  return { ok: true, url, network: true };
}

export async function assertSafeHost(host, allowPrivateNetwork = false) {
  const normalized = normalizeHost(host);
  if (allowPrivateNetwork) return;
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    throw new Error("Private or local host blocked: " + normalized);
  }
  const addresses = isIP(normalized)
    ? [{ address: normalized }]
    : await lookup(normalized, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Private or unresolved network destination blocked: " + normalized);
  }
}
