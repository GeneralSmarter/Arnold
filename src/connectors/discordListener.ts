import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message
} from "discord.js";
import type { AppConfig } from "../config/config.js";
import { AgentLoop } from "../agent/loop.js";
import { SessionStore } from "../memory/sessionStore.js";
import { createProvider } from "../providers/index.js";
import { SecretsStore } from "../secrets/secretsStore.js";
import { logger } from "../utils/logger.js";

export async function runDiscordListener(config: AppConfig): Promise<void> {
  if (!config.connectors.discord.enabled) {
    throw new Error("Discord connector is disabled. Set connectors.discord.enabled to true in .agent/config.json.");
  }

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

  await client.login(botToken);
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
  const answer = await loop.runUserTurn(prompt);
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
