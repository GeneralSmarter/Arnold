import type { AppConfig } from "../config/config.js";
import { AgentLoop } from "../agent/loop.js";
import { SessionStore } from "../memory/sessionStore.js";
import { createProvider } from "../providers/index.js";
import { SecretsStore } from "../secrets/secretsStore.js";
import { logger } from "../utils/logger.js";
import { TelegramClient, type TelegramMessage } from "./telegramClient.js";

export async function runTelegramListener(config: AppConfig): Promise<void> {
  if (!config.connectors.telegram.enabled) {
    throw new Error("Telegram connector is disabled. Set connectors.telegram.enabled to true in .agent/config.json.");
  }

  const secrets = await new SecretsStore(config.workspaceRoot).load();
  const botToken = secrets.telegram?.botToken;
  if (!botToken) {
    throw new Error("Missing Telegram bot token. Run: agent auth telegram token");
  }

  const client = new TelegramClient(botToken);
  const me = await client.getMe();
  logger.info(`Telegram listener started as @${me.username ?? me.id}.`);
  logger.info("Use /id from Telegram to find your chat ID, then add it to connectors.telegram.allowedChatIds.");

  const sessionStore = new SessionStore(config.workspaceRoot);
  let offset: number | undefined;

  while (true) {
    const updates = await client.getUpdates({
      offset,
      timeout: config.connectors.telegram.pollTimeoutSeconds
    });

    for (const update of updates) {
      offset = update.update_id + 1;
      if (!update.message?.text) {
        continue;
      }
      try {
        await handleMessage(client, config, sessionStore, update.message);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : "Unable to handle Telegram message.");
        await client.sendMessage(update.message.chat.id, "Arnold hit an error handling that message.");
      }
    }
  }
}

async function handleMessage(
  client: TelegramClient,
  config: AppConfig,
  sessionStore: SessionStore,
  message: TelegramMessage
): Promise<void> {
  const text = message.text?.trim() ?? "";
  const chatId = String(message.chat.id);

  if (text === "/id" || text.startsWith("/id@")) {
    await client.sendMessage(message.chat.id, `Chat ID: ${chatId}`);
    return;
  }

  if (!isAllowedChat(config, chatId)) {
    await client.sendMessage(
      message.chat.id,
      `This chat is not allowed yet. Send /id, then add that ID to connectors.telegram.allowedChatIds.`
    );
    return;
  }

  if (text === "/start" || text === "/help" || text.startsWith("/start@") || text.startsWith("/help@")) {
    await client.sendMessage(
      message.chat.id,
      [
        "Arnold is online.",
        "",
        "Commands:",
        "/status - Check the bot is connected.",
        "/id - Show this chat ID for setup.",
        "/ask <message> - Ask Arnold a question."
      ].join("\n")
    );
    return;
  }

  if (text === "/status" || text.startsWith("/status@")) {
    await client.sendMessage(message.chat.id, "Arnold is online.");
    return;
  }

  const prompt = parseAskCommand(text);
  if (!prompt) {
    await client.sendMessage(message.chat.id, "Use /ask <message> to talk to Arnold.");
    return;
  }

  await client.sendMessage(message.chat.id, "Thinking...");
  const safeRemoteConfig: AppConfig = {
    ...config,
    approvalMode: "suggest"
  };
  const provider = createProvider(safeRemoteConfig.provider);
  const session = await sessionStore.create(safeRemoteConfig);
  await sessionStore.save(session);
  const loop = new AgentLoop(safeRemoteConfig, provider, sessionStore, session);
  const answer = await loop.runUserTurn(prompt);
  await client.sendMessage(message.chat.id, answer);
}

function isAllowedChat(config: AppConfig, chatId: string): boolean {
  return config.connectors.telegram.allowedChatIds.includes(chatId);
}

function parseAskCommand(text: string): string | undefined {
  if (text.startsWith("/ask ")) {
    return text.slice("/ask ".length).trim() || undefined;
  }
  const addressedMatch = text.match(/^\/ask@\S+\s+(.+)$/s);
  return addressedMatch?.[1]?.trim() || undefined;
}
