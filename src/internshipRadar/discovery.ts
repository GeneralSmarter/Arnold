import type { AppConfig } from "../config/config.js";
import {
  appendActivity,
  loadInternshipStores,
  saveOpportunities
} from "./store.js";
import type {
  DiscoveryResult,
  InternshipOpportunity,
  InternshipRadarSettings,
  InternshipSource
} from "./types.js";

export async function discoverInternships(config: AppConfig): Promise<DiscoveryResult> {
  const stores = await loadInternshipStores(config.workspaceRoot);
  const warnings: string[] = [];
  if (!config.connectors.web.enabled) {
    warnings.push("Web connector is disabled in .agent/config.json.");
    await appendActivity(config.workspaceRoot, "Discovery skipped because web connector is disabled.");
    return { sourcesChecked: 0, discovered: 0, updated: 0, warnings };
  }

  const opportunities = [...stores.opportunities];
  let sourcesChecked = 0;
  let discovered = 0;
  let updated = 0;

  for (const source of stores.settings.sources.filter((item) => item.enabled)) {
    try {
      const page = await fetchSource(source.url, config);
      sourcesChecked += 1;
      const candidates = extractOpportunities(page.text, source, stores.settings);
      for (const candidate of candidates) {
        const existingIndex = opportunities.findIndex((item) => item.id === candidate.id);
        if (existingIndex >= 0) {
          opportunities[existingIndex] = {
            ...opportunities[existingIndex],
            summary: candidate.summary,
            fitScore: Math.max(opportunities[existingIndex].fitScore, candidate.fitScore),
            confidence: strongerConfidence(opportunities[existingIndex].confidence, candidate.confidence),
            lastSeenAt: candidate.lastSeenAt
          };
          updated += 1;
        } else {
          opportunities.push(candidate);
          discovered += 1;
        }
      }
    } catch (error) {
      warnings.push(`${source.name}: ${error instanceof Error ? error.message : "Unable to fetch source."}`);
    }
  }

  await saveOpportunities(config.workspaceRoot, sortOpportunities(opportunities));
  await appendActivity(
    config.workspaceRoot,
    `Discovery complete: checked ${sourcesChecked} sources, found ${discovered} new, updated ${updated}.`
  );

  return { sourcesChecked, discovered, updated, warnings };
}

interface FetchedSource {
  text: string;
}

async function fetchSource(url: string, config: AppConfig): Promise<FetchedSource> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Arnold Internship Radar/0.1"
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await readLimited(response, config.connectors.web.maxBytes);
    return { text: toReadableText(html) };
  } finally {
    clearTimeout(timeout);
  }
}

function extractOpportunities(
  text: string,
  source: InternshipSource,
  settings: InternshipRadarSettings
): InternshipOpportunity[] {
  if (source.kind === "program") {
    return extractProgramOpportunity(text, source, settings);
  }

  const chunks = chunkText(text);
  const now = new Date().toISOString();
  const opportunities: InternshipOpportunity[] = [];

  for (const chunk of chunks) {
    if (!hasRoleSignal(chunk, settings) || isGenericNavigation(chunk)) {
      continue;
    }
    const score = scoreChunk(chunk, settings);
    if (score < 5) {
      continue;
    }
    const title = guessTitle(chunk);
    const company = guessCompany(chunk, settings);
    opportunities.push({
      id: makeOpportunityId(source.url, title, company),
      title,
      company,
      location: guessLocation(chunk),
      url: source.url,
      sourceName: source.name,
      summary: trimSummary(chunk),
      fitScore: score,
      confidence: score >= 7 ? "high" : score >= 5 ? "medium" : "low",
      discoveredAt: now,
      lastSeenAt: now,
      status: "new"
    });
  }

  return dedupeById(opportunities).slice(0, 12);
}

function extractProgramOpportunity(
  text: string,
  source: InternshipSource,
  settings: InternshipRadarSettings
): InternshipOpportunity[] {
  if (!text.toLowerCase().includes("internship")) {
    return [];
  }
  const now = new Date().toISOString();
  const title = `${source.name.replace(/\s+Candidates$/i, "")} internship programme`;
  return [
    {
      id: makeOpportunityId(source.url, title, source.name),
      title,
      company: source.name.replace(/\s+Candidates$/i, ""),
      location: "New Zealand",
      url: source.url,
      sourceName: source.name,
      summary: trimSummary(bestProgramSummary(text, settings)),
      fitScore: 6,
      confidence: "medium",
      discoveredAt: now,
      lastSeenAt: now,
      status: "new"
    }
  ];
}

function scoreChunk(chunk: string, settings: InternshipRadarSettings): number {
  const normalized = chunk.toLowerCase();
  let score = 0;
  for (const keyword of settings.profile.keywords) {
    if (normalized.includes(keyword.toLowerCase())) {
      score += keyword.includes("intern") ? 2 : 1;
    }
  }
  for (const location of settings.profile.locations) {
    if (normalized.includes(location.toLowerCase())) {
      score += 1;
    }
  }
  for (const employer of settings.profile.employerWatchlist) {
    if (normalized.includes(employer.toLowerCase())) {
      score += 2;
    }
  }
  for (const excluded of settings.profile.excludeKeywords) {
    if (normalized.includes(excluded.toLowerCase())) {
      score -= 3;
    }
  }
  return score;
}

function chunkText(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+|\s{3,}/g).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += 1) {
    chunks.push(sentences.slice(i, i + 3).join(" "));
  }
  return chunks;
}

function hasRoleSignal(chunk: string, settings: InternshipRadarSettings): boolean {
  const normalized = chunk.toLowerCase();
  const hasInternshipSignal = /\b(internship|intern|student engineer|placement|graduate programme)\b/i.test(chunk);
  const hasFieldSignal = settings.profile.keywords
    .filter((keyword) => !keyword.includes("intern"))
    .some((keyword) => normalized.includes(keyword.toLowerCase()));
  const hasEmployerSignal = settings.profile.employerWatchlist.some((employer) =>
    normalized.includes(employer.toLowerCase())
  );
  return hasInternshipSignal && (hasFieldSignal || hasEmployerSignal);
}

function isGenericNavigation(chunk: string): boolean {
  const normalized = chunk.toLowerCase();
  const genericHits = [
    "login",
    "sign up",
    "career advice",
    "all employers",
    "employer site",
    "register for free",
    "post jobs",
    "search enter"
  ].filter((phrase) => normalized.includes(phrase)).length;
  return genericHits >= 3;
}

function bestProgramSummary(text: string, settings: InternshipRadarSettings): string {
  const chunks = chunkText(text);
  return chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, settings) }))
    .sort((a, b) => b.score - a.score)[0]?.chunk ?? text.slice(0, 420);
}

function guessTitle(chunk: string): string {
  const match = chunk.match(/((?:summer\s+)?(?:mechanical|mechatronics|electrical|automation|robotics|engineering|embedded|software)[^.!?]{0,80}(?:internship|intern|student role|placement))/i)
    ?? chunk.match(/((?:internship|intern|student engineer)[^.!?]{0,90})/i);
  return cleanTitle(match?.[1] ?? chunk.slice(0, 90));
}

function guessCompany(chunk: string, settings: InternshipRadarSettings): string | undefined {
  const found = settings.profile.employerWatchlist.find((employer) =>
    chunk.toLowerCase().includes(employer.toLowerCase())
  );
  return found;
}

function guessLocation(chunk: string): string | undefined {
  const match = chunk.match(/\b(Auckland|Wellington|Christchurch|Hamilton|Tauranga|Dunedin|Canterbury|New Zealand|Remote|Hybrid)\b/i);
  return match?.[1];
}

function trimSummary(chunk: string): string {
  return chunk.replace(/\s+/g, " ").trim().slice(0, 420);
}

function cleanTitle(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[^A-Za-z0-9]+/, "").trim() || "Potential internship";
}

function makeOpportunityId(url: string, title: string, company?: string): string {
  return `${slugify(company ?? "source")}-${slugify(title)}-${hash(url).slice(0, 8)}`;
}

function strongerConfidence(
  a: InternshipOpportunity["confidence"],
  b: InternshipOpportunity["confidence"]
): InternshipOpportunity["confidence"] {
  const order = { low: 1, medium: 2, high: 3 };
  return order[b] > order[a] ? b : a;
}

function sortOpportunities(opportunities: InternshipOpportunity[]): InternshipOpportunity[] {
  return opportunities.sort((a, b) => b.fitScore - a.fitScore || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

function dedupeById(opportunities: InternshipOpportunity[]): InternshipOpportunity[] {
  const seen = new Set<string>();
  return opportunities.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const text = await response.text();
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > maxBytes) {
    return text.slice(0, maxBytes);
  }
  return text;
}

function toReadableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

function hash(value: string): string {
  let hashValue = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hashValue = (hashValue * 33) ^ value.charCodeAt(i);
  }
  return (hashValue >>> 0).toString(16);
}
