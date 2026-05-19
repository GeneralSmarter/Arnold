import { lookup } from "node:dns/promises";
import net from "node:net";
import type { Tool } from "./types.js";

export const fetchUrlTool: Tool = {
  name: "fetch_url",
  description: "Fetch a public HTTP(S) URL and return readable text.",
  risky: false,
  async run(input, context) {
    try {
      if (!context.config.connectors.web.enabled) {
        return { ok: false, content: "Web connector is disabled in .agent/config.json." };
      }

      const rawUrl = String(input.url ?? "").trim();
      if (!rawUrl) {
        return { ok: false, content: "Missing required input: url" };
      }

      const fetched = await fetchPublicUrl(rawUrl, {
        maxBytes: context.config.connectors.web.maxBytes,
        maxRedirects: context.config.connectors.web.maxRedirects,
        blockedHosts: context.config.connectors.web.blockedHosts,
        allowedDomains: context.config.connectors.web.allowedDomains
      });

      return {
        ok: true,
        content: [
          `url: ${fetched.url}`,
          fetched.title ? `title: ${fetched.title}` : undefined,
          `status: ${fetched.status}`,
          "",
          fetched.text
        ]
          .filter((line) => line !== undefined)
          .join("\n")
      };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to fetch URL." };
    }
  }
};

interface FetchOptions {
  maxBytes: number;
  maxRedirects: number;
  blockedHosts: string[];
  allowedDomains: string[];
}

interface FetchedPage {
  url: string;
  status: number;
  title?: string;
  text: string;
}

async function fetchPublicUrl(rawUrl: string, options: FetchOptions): Promise<FetchedPage> {
  let url = normalizeUrl(rawUrl);

  for (let redirects = 0; redirects <= options.maxRedirects; redirects += 1) {
    await assertPublicUrl(url, options);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Arnold/0.1 fetch_url"
        }
      });

      if (isRedirect(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Redirect response from ${url.toString()} did not include a location.`);
        }
        if (redirects === options.maxRedirects) {
          throw new Error(`Too many redirects while fetching ${rawUrl}.`);
        }
        url = new URL(location, url);
        continue;
      }

      const html = await readLimitedText(response, options.maxBytes);
      const title = extractTitle(html);
      return {
        url: url.toString(),
        status: response.status,
        title,
        text: toReadableText(html)
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Too many redirects while fetching ${rawUrl}.`);
}

function normalizeUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("fetch_url only supports http and https URLs.");
  }
  if (url.username || url.password) {
    throw new Error("fetch_url does not allow URLs containing usernames or passwords.");
  }
  return url;
}

async function assertPublicUrl(url: URL, options: FetchOptions): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (options.blockedHosts.map((host) => host.toLowerCase()).includes(hostname)) {
    throw new Error(`Blocked host: ${hostname}`);
  }
  if (options.allowedDomains.length > 0 && !matchesAllowedDomain(hostname, options.allowedDomains)) {
    throw new Error(`Host is not in connectors.web.allowedDomains: ${hostname}`);
  }
  if (isPrivateHost(hostname)) {
    throw new Error(`Blocked private or local host: ${hostname}`);
  }

  const records = await lookup(hostname, { all: true });
  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new Error(`Blocked private network address for ${hostname}: ${record.address}`);
    }
  }
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(`Response exceeded maximum size of ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  }

  return new TextDecoder("utf8").decode(Buffer.concat(chunks));
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function matchesAllowedDomain(hostname: string, domains: string[]): boolean {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function isPrivateHost(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local");
}

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }

  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized === "::"
  );
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].replace(/\s+/g, " ").trim()) : undefined;
}

function toReadableText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
