import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message
} from "discord.js";
import { open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config/config.js";
import { getAgentDir } from "../config/config.js";
import { AgentLoop } from "../agent/loop.js";
import { SessionStore } from "../memory/sessionStore.js";
import { createProvider } from "../providers/index.js";
import { SecretsStore } from "../secrets/secretsStore.js";
import { logger } from "../utils/logger.js";

export async function runDiscordListener(config: AppConfig): Promise<void> {
  if (!config.connectors.discord.enabled) {
    throw new Error("Discord connector is disabled. Set connectors.discord.enabled to true in .agent/config.json.");
  }

  const releaseLock = await acquireDiscordListenerLock(config.workspaceRoot);
  process.once("exit", releaseLock);
  process.once("SIGINT", () => {
    releaseLock();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    releaseLock();
    process.exit(0);
  });

  const secrets = await new SecretsStore(config.workspaceRoot).load();
  const botToken = secrets.discord?.botToken;
  if (!botToken) {
    throw new Error("Missing Discord bot token. Run: agent auth discord token");
  }

  const sessionStore = new SessionStore(config.workspaceRoot);
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`Discord listener started as ${readyClient.user.tag}.`);
    logger.info("Use !id in Discord to find guild/channel IDs, then add them to .agent/config.json.");
  });

  client.on(Events.Error, (error) => {
    logger.error(`Discord client error: ${error.message}`);
  });

  client.on(Events.Warn, (message) => {
    logger.info(`Discord warning: ${message}`);
  });

  client.on(Events.ShardError, (error) => {
    logger.error(`Discord shard error: ${error.message}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) {
      return;
    }

    try {
      await handleMessage(config, sessionStore, message);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : "Unable to handle Discord message.");
      await safeReply(message, "Arnold hit an error handling that message.");
    }
  });

  logger.info("Connecting to Discord Gateway...");
  try {
    await withTimeout(client.login(botToken), 30_000, "Discord Gateway login did not finish within 30 seconds.");
    await waitForReady(client);
  } catch (error) {
    releaseLock();
    throw error;
  }
}

async function handleMessage(
  config: AppConfig,
  sessionStore: SessionStore,
  message: Message
): Promise<void> {
  const text = message.content.trim();
  const prefix = config.connectors.discord.commandPrefix;

  if (!text.startsWith(prefix)) {
    return;
  }

  const commandText = text.slice(prefix.length).trim();
  const [command, ...rest] = commandText.split(/\s+/);
  const normalizedCommand = command?.toLowerCase();

  if (normalizedCommand === "id") {
    await safeReply(message, formatIdMessage(message));
    return;
  }

  if (!isAllowedMessage(config, message)) {
    await safeReply(
      message,
      `This Discord location is not allowed yet. Send ${prefix}id, then add the guild or channel ID to connectors.discord.`
    );
    return;
  }

  if (normalizedCommand === "help") {
    await safeReply(
      message,
      [
        "Arnold is online.",
        "",
        "Commands:",
        `${prefix}status - Check the bot is connected.`,
        `${prefix}id - Show Discord IDs for setup.`,
        `${prefix}ask <message> - Ask Arnold a question.`
      ].join("\n")
    );
    return;
  }

  if (normalizedCommand === "status") {
    await safeReply(message, "Arnold is online.");
    return;
  }

  if (normalizedCommand !== "ask") {
    await safeReply(message, `Use ${prefix}ask <message> to talk to Arnold.`);
    return;
  }

  const prompt = rest.join(" ").trim();
  if (!prompt) {
    await safeReply(message, `Use ${prefix}ask <message> to talk to Arnold.`);
    return;
  }

  await safeReply(message, "Thinking...");
  const safeRemoteConfig: AppConfig = {
    ...config,
    approvalMode: "suggest"
  };
  const provider = createProvider(safeRemoteConfig.provider);
  const session = await sessionStore.create(safeRemoteConfig);
  await sessionStore.save(session);
  const loop = new AgentLoop(safeRemoteConfig, provider, sessionStore, session);
  const answer = await loop.runUserTurn(withDiscordContext(message, prompt));
  await sendLongReply(message, answer);
}

function isAllowedMessage(config: AppConfig, message: Message): boolean {
  const { allowedChannelIds, allowedGuildIds } = config.connectors.discord;
  if (allowedChannelIds.includes(message.channelId)) {
    return true;
  }
  if (message.guildId && allowedGuildIds.includes(message.guildId)) {
    return true;
  }
  return false;
}

function formatIdMessage(message: Message): string {
  const parts = [`Channel ID: ${message.channelId}`];
  if (message.guildId) {
    parts.unshift(`Guild ID: ${message.guildId}`);
  }
  return parts.join("\n");
}

async function sendLongReply(message: Message, text: string): Promise<void> {
  const maxLength = 1900;
  for (let index = 0; index < text.length; index += maxLength) {
    await safeReply(message, text.slice(index, index + maxLength));
  }
}

async function safeReply(message: Message, text: string): Promise<void> {
  if (message.channel.type === ChannelType.DM) {
    await message.channel.send(text);
    return;
  }
  await message.reply(text);
}

function withDiscordContext(message: Message, prompt: string): string {
  return [
    "Discord message context:",
    `Guild ID: ${message.guildId ?? "direct-message"}`,
    `Guild name: ${message.guild?.name ?? "direct-message"}`,
    `Channel ID: ${message.channelId}`,
    `Channel name: ${getChannelName(message)}`,
    `Author ID: ${message.author.id}`,
    `Author username: ${message.author.username}`,
    "",
    `User request: ${prompt}`
  ].join("\n");
}

function getChannelName(message: Message): string {
  const channel = message.channel;
  if ("name" in channel && typeof channel.name === "string") {
    return `#${channel.name}`;
  }
  return "direct-message";
}

async function waitForReady(client: Client): Promise<void> {
  if (client.isReady()) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Discord login succeeded, but the client did not become ready within 30 seconds."));
    }, 30_000);

    client.once(Events.ClientReady, () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function acquireDiscordListenerLock(workspaceRoot: string): Promise<() => void> {
  const lockPath = path.join(getAgentDir(workspaceRoot), "discord-listener.lock");
  await removeStaleLock(lockPath);

  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(String(process.pid), "utf8");
    await handle.close();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error("Discord listener already appears to be running. Stop it before starting another one.");
    }
    throw error;
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    void unlink(lockPath).catch(() => undefined);
  };
}

async function removeStaleLock(lockPath: string): Promise<void> {
  try {
    const rawPid = (await readFile(lockPath, "utf8")).trim();
    const pid = Number(rawPid);
    if (Number.isInteger(pid) && pid > 0 && isProcessRunning(pid)) {
      return;
    }
    await unlink(lockPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
