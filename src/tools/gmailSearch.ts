import type { Tool } from "./types.js";
import { searchGmail } from "../connectors/gmailClient.js";

export const gmailSearchTool: Tool = {
  name: "gmail_search",
  description: "Search Gmail messages with Gmail query syntax.",
  risky: false,
  async run(input, context) {
    try {
      const query = String(input.query ?? "").trim();
      if (!query) {
        return { ok: false, content: "Missing required input: query" };
      }

      const maxResults = normalizeLimit(input.maxResults, context.config.connectors.gmail.defaultSearchLimit);
      const results = await searchGmail(context.config, query, maxResults);
      if (results.length === 0) {
        return { ok: true, content: "No Gmail messages matched that query." };
      }

      return {
        ok: true,
        content: results
          .map((message) =>
            [
              `id: ${message.id}`,
              `thread: ${message.threadId}`,
              message.date ? `date: ${message.date}` : undefined,
              message.from ? `from: ${message.from}` : undefined,
              message.subject ? `subject: ${message.subject}` : undefined,
              message.snippet ? `snippet: ${message.snippet}` : undefined
            ]
              .filter(Boolean)
              .join("\n")
          )
          .join("\n\n")
      };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to search Gmail." };
    }
  }
};

function normalizeLimit(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.max(1, Math.min(50, Math.trunc(numberValue)));
}
