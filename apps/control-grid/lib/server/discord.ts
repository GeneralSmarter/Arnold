import "server-only";
import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { agentDir, workspaceRoot } from "./workspace";
import { getArnoldConfig, updateDiscordConfig } from "./config";

const execFileAsync = promisify(execFile);

export async function getDiscordStatus() {
  const config = await getArnoldConfig();
  const lockPath = path.join(agentDir, "discord-listener.lock");
  const outLogPath = path.join(agentDir, "discord-listener.out.log");
  const lock = await readFile(lockPath, "utf8").catch(() => "");
  const outLog = await readFile(outLogPath, "utf8").catch(() => "");
  const lockStat = await stat(lockPath).catch(() => undefined);
  const tokenConfigured = (await runArnold(["auth", "discord", "status"])).includes("configured");

  return {
    config: config.connectors.discord ?? {},
    tokenConfigured,
    listenerPid: lock.trim() || null,
    listenerOnline: Boolean(lock.trim()),
    listenerUpdatedAt: lockStat?.mtime.toISOString() ?? null,
    recentLog: outLog.trim().split(/\r?\n/).slice(-6)
  };
}

export async function setDiscordRespondToAll(value: boolean) {
  const config = await getArnoldConfig();
  await updateDiscordConfig({
    ...config.connectors.discord,
    respondToAllMessages: value
  });
  revalidatePath("/team");
}

export async function addAllowedDiscordChannel(channelId: string) {
  const config = await getArnoldConfig();
  const discord = config.connectors.discord ?? {};
  const ids = new Set(discord.allowedChannelIds ?? []);
  ids.add(channelId.trim());
  await updateDiscordConfig({ ...discord, allowedChannelIds: [...ids].filter(Boolean) });
  revalidatePath("/team");
}

export async function createDiscordChannel(name: string) {
  const result = await runArnold(["discord", "ensure-channels", normalizeChannelName(name)]);
  revalidatePath("/team");
  return { ok: !result.toLowerCase().includes("error"), message: result };
}

export async function renameDiscordChannel(channelId: string, name: string) {
  const result = await runArnold(["discord", "rename-channel", channelId, normalizeChannelName(name)]);
  revalidatePath("/team");
  return { ok: !result.toLowerCase().includes("error"), message: result };
}

function normalizeChannelName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

async function runArnold(args: string[]) {
  try {
    const result = await execFileAsync("node", ["dist/cli.js", ...args], {
      cwd: workspaceRoot,
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: 512 * 1024
    });
    return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  } catch (error) {
    return error instanceof Error ? error.message : "Arnold command failed.";
  }
}
