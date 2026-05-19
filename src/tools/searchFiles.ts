import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Tool } from "./types.js";
import { assertNotProtectedWorkspacePath, resolveInsideWorkspace } from "../utils/paths.js";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".pnpm-store", "sessions"]);
const DEFAULT_MAX_RESULTS = 50;

export const searchFilesTool: Tool = {
  name: "search_files",
  description: "Search workspace text files for a literal string.",
  risky: false,
  async run(input, context) {
    const query = String(input.query ?? "").trim();
    const rootPath = String(input.path ?? ".").trim() || ".";
    const maxResults = normalizeLimit(input.maxResults);
    if (!query) {
      return { ok: false, content: "Missing required input: query" };
    }

    try {
      const root = resolveInsideWorkspace(context.config.workspaceRoot, rootPath);
      const results: string[] = [];
      await searchDirectory(context.config.workspaceRoot, root, query, maxResults, results);
      return {
        ok: true,
        content: results.length ? results.join("\n") : `No matches for "${query}".`
      };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to search files." };
    }
  }
};

async function searchDirectory(
  workspaceRoot: string,
  directory: string,
  query: string,
  maxResults: number,
  results: string[]
): Promise<void> {
  if (results.length >= maxResults) {
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= maxResults) {
      return;
    }

    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await searchDirectory(workspaceRoot, target, query, maxResults, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    await searchFile(workspaceRoot, target, query, maxResults, results);
  }
}

async function searchFile(
  workspaceRoot: string,
  target: string,
  query: string,
  maxResults: number,
  results: string[]
): Promise<void> {
  assertNotProtectedWorkspacePath(workspaceRoot, target);
  const fileStat = await stat(target);
  if (fileStat.size > 1_000_000) {
    return;
  }

  const content = await readFile(target, "utf8").catch(() => undefined);
  if (content === undefined || content.includes("\0")) {
    return;
  }

  const relative = path.relative(workspaceRoot, target).replace(/\\/g, "/");
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length && results.length < maxResults; index += 1) {
    if (lines[index].includes(query)) {
      results.push(`${relative}:${index + 1}: ${lines[index].trim()}`);
    }
  }
}

function normalizeLimit(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.max(1, Math.min(200, Math.trunc(numberValue)));
}
