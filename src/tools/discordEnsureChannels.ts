import type { Tool } from "./types.js";
import { ensureDiscordTextChannels } from "../connectors/discordSetup.js";

export const discordEnsureChannelsTool: Tool = {
  name: "discord_ensure_channels",
  description: "Create missing Discord text channels in the configured guild, or reuse existing ones.",
  risky: true,
  approvalPreview(input) {
    const channels = normalizeChannelInput(input.channels);
    return `Ensure Discord text channels:\n${channels.map((channel) => `- #${channel}`).join("\n") || "(none)"}`;
  },
  async run(input, context) {
    try {
      const channels = normalizeChannelInput(input.channels);
      if (channels.length === 0) {
        return { ok: false, content: "Missing required input: channels" };
      }
      const result = await ensureDiscordTextChannels(context.config, channels);
      return {
        ok: true,
        content: [
          `Discord guild ${result.guildId} channels:`,
          ...result.channels.map((channel) => `- ${channel.status}: #${channel.name} (${channel.id})`)
        ].join("\n")
      };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to ensure Discord channels." };
    }
  }
};

function normalizeChannelInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return [];
  }
  return text.split(",").map((item) => item.trim()).filter(Boolean);
}
