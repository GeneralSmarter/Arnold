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
  },
  {
    name: "telegram",
    displayName: "Telegram",
    description: "Receive remote chat commands through a Telegram bot using long polling.",
    tools: []
  },
  {
    name: "discord",
    displayName: "Discord",
    description: "Receive remote chat commands through a Discord bot.",
    tools: []
  }
];

export function listConnectors(): ConnectorMetadata[] {
  return connectors;
}
