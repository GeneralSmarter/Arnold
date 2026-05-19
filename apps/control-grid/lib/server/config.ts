import "server-only";
import path from "node:path";
import { readJsonFile, writeJsonFile } from "./json";
import { agentDir } from "./workspace";

export interface ArnoldConfig {
  provider: string;
  approvalMode: string;
  workspaceRoot: string;
  connectors: {
    gmail?: { enabled?: boolean; defaultSearchLimit?: number };
    web?: { enabled?: boolean };
    telegram?: { enabled?: boolean; allowedChatIds?: string[] };
    discord?: {
      enabled?: boolean;
      allowedGuildIds?: string[];
      allowedChannelIds?: string[];
      commandPrefix?: string;
      respondToAllMessages?: boolean;
    };
  };
}

const configPath = path.join(agentDir, "config.json");

export async function getArnoldConfig() {
  return readJsonFile<ArnoldConfig>(configPath, {
    provider: "unknown",
    approvalMode: "unknown",
    workspaceRoot: "",
    connectors: {}
  });
}

export async function updateDiscordConfig(discord: NonNullable<ArnoldConfig["connectors"]["discord"]>) {
  const config = await getArnoldConfig();
  config.connectors.discord = {
    ...config.connectors.discord,
    ...discord
  };
  await writeJsonFile(configPath, config);
  return config;
}
