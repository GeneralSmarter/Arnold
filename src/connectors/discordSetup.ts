import { ChannelType, REST, Routes } from "discord.js";
import type { AppConfig } from "../config/config.js";
import { SecretsStore } from "../secrets/secretsStore.js";

interface DiscordGuildChannel {
  id: string;
  name: string;
  type: number;
}

export interface DiscordChannelSetupResult {
  guildId: string;
  channels: Array<{
    id: string;
    name: string;
    status: "created" | "existing";
  }>;
}

export async function ensureDiscordTextChannels(
  config: AppConfig,
  channelNames: string[]
): Promise<DiscordChannelSetupResult> {
  if (!config.connectors.discord.enabled) {
    throw new Error("Discord connector is disabled. Set connectors.discord.enabled to true in .agent/config.json.");
  }

  const guildId = config.connectors.discord.allowedGuildIds[0];
  if (!guildId) {
    throw new Error("Missing Discord guild ID. Add one to connectors.discord.allowedGuildIds in .agent/config.json.");
  }

  const secrets = await new SecretsStore(config.workspaceRoot).load();
  const botToken = secrets.discord?.botToken;
  if (!botToken) {
    throw new Error("Missing Discord bot token. Run: agent auth discord token");
  }

  const names = normalizeChannelNames(channelNames);
  if (names.length === 0) {
    throw new Error("Provide at least one channel name.");
  }

  const rest = new REST({ version: "10" }).setToken(botToken);
  const existingChannels = (await rest.get(Routes.guildChannels(guildId))) as DiscordGuildChannel[];
  const textChannels = existingChannels.filter((channel) => channel.type === ChannelType.GuildText);
  const results: DiscordChannelSetupResult["channels"] = [];

  for (const name of names) {
    const existing = textChannels.find((channel) => channel.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      results.push({ id: existing.id, name: existing.name, status: "existing" });
      continue;
    }

    const created = (await rest.post(Routes.guildChannels(guildId), {
      body: {
        name,
        type: ChannelType.GuildText
      }
    })) as DiscordGuildChannel;
    textChannels.push(created);
    results.push({ id: created.id, name: created.name, status: "created" });
  }

  return { guildId, channels: results };
}

function normalizeChannelNames(channelNames: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const channelName of channelNames) {
    const normalized = channelName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    names.push(normalized);
  }
  return names;
}
