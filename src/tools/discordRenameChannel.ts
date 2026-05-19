import type { Tool } from "./types.js";
import { renameDiscordChannel } from "../connectors/discordSetup.js";

export const discordRenameChannelTool: Tool = {
  name: "discord_rename_channel",
  description: "Rename a Discord channel by channel ID.",
  risky: true,
  approvalPreview(input) {
    const channelId = String(input.channelId ?? "").trim() || "(missing channelId)";
    const newName = String(input.newName ?? "").trim() || "(missing newName)";
    return `Rename Discord channel:\nChannel ID: ${channelId}\nNew name: #${newName}`;
  },
  async run(input, context) {
    try {
      const channelId = String(input.channelId ?? "").trim();
      const newName = String(input.newName ?? "").trim();
      if (!channelId) {
        return { ok: false, content: "Missing required input: channelId" };
      }
      if (!newName) {
        return { ok: false, content: "Missing required input: newName" };
      }
      const result = await renameDiscordChannel(context.config, channelId, newName);
      return {
        ok: true,
        content: `Renamed Discord channel ${result.id} from #${result.oldName} to #${result.newName}.`
      };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to rename Discord channel." };
    }
  }
};
