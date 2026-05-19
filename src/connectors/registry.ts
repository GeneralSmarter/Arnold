import type { ConnectorMetadata } from "./types.js";

export const connectors: ConnectorMetadata[] = [
  {
    name: "gmail",
    displayName: "Gmail",
    description: "Search and read Gmail messages, and create drafts with user approval.",
    tools: ["gmail_search", "gmail_read", "gmail_create_draft"]
  },
  {
    name: "web",
    displayName: "Web Fetch",
    description: "Fetch readable text from explicit public HTTP(S) URLs.",
    tools: ["fetch_url"]
  }
];

export function listConnectors(): ConnectorMetadata[] {
  return connectors;
}
