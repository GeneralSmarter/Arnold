#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { AgentLoop } from "./agent/loop.js";
import { describeRun } from "./agent/planner.js";
import {
  applyConfigOverrides,
  loadConfig,
  type AppConfig,
  type ApprovalMode
} from "./config/config.js";
import {
  beginGmailLoopbackLogin,
  exchangeGmailAuthCode,
  getGmailAuthStatus,
  toStoredToken
} from "./connectors/gmailAuth.js";
import { getDiscordBotProfile } from "./connectors/discordClient.js";
import { runDiscordListener } from "./connectors/discordListener.js";
import { ensureDiscordTextChannels } from "./connectors/discordSetup.js";
import { runTelegramListener } from "./connectors/telegramListener.js";
import { listConnectors } from "./connectors/registry.js";
import { SessionStore } from "./memory/sessionStore.js";
import { createProvider } from "./providers/index.js";
import type { ProviderName } from "./providers/types.js";
import { SecretsStore } from "./secrets/secretsStore.js";
import { logger } from "./utils/logger.js";

interface ParsedArgs {
  command?: string;
  subcommand?: string;
  action?: string;
  provider?: ProviderName;
  approvalMode?: ApprovalMode;
  workspaceRoot?: string;
  rest: string[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.command || args.command === "help" || args.command === "--help" || args.command === "-h") {
    printHelp();
    return;
  }

  const config = await loadConfig(args.workspaceRoot ?? process.cwd()).then((loaded) =>
    applyConfigOverrides(loaded, {
      provider: args.provider,
      approvalMode: args.approvalMode,
      workspaceRoot: args.workspaceRoot
    })
  );

  if (args.command === "config") {
    logger.info(JSON.stringify(config, null, 2));
    return;
  }

  if (args.command === "connectors") {
    logger.info(JSON.stringify(listConnectors(), null, 2));
    return;
  }

  if (args.command === "auth" && args.subcommand === "gmail") {
    await handleGmailAuth(config, args.action);
    return;
  }

  if (args.command === "auth" && args.subcommand === "telegram") {
    await handleTelegramAuth(config, args.action);
    return;
  }

  if (args.command === "auth" && args.subcommand === "discord") {
    await handleDiscordAuth(config, args.action);
    return;
  }

  if (args.command === "telegram" && args.subcommand === "listen") {
    await runTelegramListener(config);
    return;
  }

  if (args.command === "discord" && args.subcommand === "listen") {
    await runDiscordListener(config);
    return;
  }

  if (args.command === "discord" && args.subcommand === "ensure-channels") {
    await handleDiscordEnsureChannels(config, args.rest);
    return;
  }

  if (args.command === "chat") {
    await chat(config);
    return;
  }

  logger.error(`Unknown command: ${args.command}`);
  printHelp();
  process.exitCode = 1;
}

async function handleDiscordEnsureChannels(config: AppConfig, channelNames: string[]): Promise<void> {
  const names = channelNames.length > 0 ? channelNames : ["general", "internship-tracker", "uni-tracker"];
  const result = await ensureDiscordTextChannels(config, names);
  logger.info(`Discord guild ${result.guildId} channels:`);
  for (const channel of result.channels) {
    logger.info(`- ${channel.status}: #${channel.name} (${channel.id})`);
  }
}

async function handleDiscordAuth(config: AppConfig, action: string | undefined): Promise<void> {
  const store = new SecretsStore(config.workspaceRoot);

  if (action === "status") {
    const secrets = await store.load();
    const botToken = secrets.discord?.botToken;
    if (!botToken) {
      logger.info("Discord bot token is not configured.");
      return;
    }
    const profile = await getDiscordBotProfile(botToken);
    logger.info(`Discord bot token is configured for ${profile.username} (${profile.id}).`);
    return;
  }

  if (action === "logout") {
    await store.clearDiscord();
    logger.info("Discord bot token removed from .agent/secrets.json.");
    return;
  }

  if (action === "token") {
    const rl = createInterface({ input, output });
    try {
      const token = stripOuterQuotes((await rl.question("Discord bot token: ")).trim());
      if (!token) {
        throw new Error("Discord bot token is required.");
      }
      const secrets = await store.load();
      await store.save({
        ...secrets,
        discord: { botToken: token }
      });
      logger.info(`Discord token saved to ${store.path()}.`);
      if (!config.connectors.discord.enabled) {
        logger.info("Discord connector is still disabled. Set connectors.discord.enabled to true in .agent/config.json.");
      }
    } finally {
      rl.close();
    }
    return;
  }

  logger.error("Usage: agent auth discord token|status|logout");
  process.exitCode = 1;
}

async function handleTelegramAuth(config: AppConfig, action: string | undefined): Promise<void> {
  const store = new SecretsStore(config.workspaceRoot);

  if (action === "status") {
    const secrets = await store.load();
    logger.info(secrets.telegram?.botToken ? "Telegram bot token is configured." : "Telegram bot token is not configured.");
    return;
  }

  if (action === "logout") {
    await store.clearTelegram();
    logger.info("Telegram bot token removed from .agent/secrets.json.");
    return;
  }

  if (action === "token") {
    const rl = createInterface({ input, output });
    try {
      const token = stripOuterQuotes((await rl.question("Telegram bot token from @BotFather: ")).trim());
      if (!token) {
        throw new Error("Telegram bot token is required.");
      }
      const secrets = await store.load();
      await store.save({
        ...secrets,
        telegram: { botToken: token }
      });
      logger.info(`Telegram token saved to ${store.path()}.`);
      if (!config.connectors.telegram.enabled) {
        logger.info("Telegram connector is still disabled. Set connectors.telegram.enabled to true in .agent/config.json.");
      }
    } finally {
      rl.close();
    }
    return;
  }

  logger.error("Usage: agent auth telegram token|status|logout");
  process.exitCode = 1;
}

async function handleGmailAuth(config: AppConfig, action: string | undefined): Promise<void> {
  if (action === "status") {
    logger.info(await getGmailAuthStatus(config));
    return;
  }

  if (action === "logout") {
    await new SecretsStore(config.workspaceRoot).clearGmail();
    logger.info("Gmail OAuth tokens removed from .agent/secrets.json.");
    return;
  }

  if (action === "login") {
    await loginGmail(config);
    return;
  }

  logger.error("Usage: agent auth gmail login|status|logout");
  process.exitCode = 1;
}

async function loginGmail(config: AppConfig): Promise<void> {
  const store = new SecretsStore(config.workspaceRoot);
  const secrets = await store.load();
  const existingClientId = secrets.google?.clientId;
  const existingClientSecret = secrets.google?.clientSecret;
  const rl = createInterface({ input, output });

  try {
    const credentialAnswer = await rl.question(
      existingClientId && existingClientSecret
        ? "Google OAuth client JSON path, or client ID (press enter to keep existing): "
        : "Google OAuth client JSON path, or client ID: "
    );
    const credentials = await resolveGoogleCredentials(
      credentialAnswer.trim(),
      existingClientId,
      existingClientSecret,
      rl
    );
    const { clientId, clientSecret } = credentials;

    if (!clientId || !clientSecret) {
      throw new Error("Gmail login requires a Google OAuth client ID and client secret.");
    }

    logger.info("Starting local Google OAuth callback server...");
    const login = await beginGmailLoopbackLogin(clientId);
    try {
      logger.info("\nOpen this URL and approve Arnold:");
      logger.info(login.authUrl);
      logger.info("\nWaiting for Google authorization in the browser...");

      const code = await login.codePromise;
      const token = await exchangeGmailAuthCode(
        clientId,
        clientSecret,
        code,
        login.redirectUri,
        login.codeVerifier
      );

      await store.save({
        ...secrets,
        google: {
          ...secrets.google,
          clientId,
          clientSecret,
          gmail: toStoredToken(token)
        }
      });
      logger.info(`Gmail login complete. Secrets saved to ${store.path()}.`);
      if (!config.connectors.gmail.enabled) {
        logger.info("Gmail connector is still disabled. Set connectors.gmail.enabled to true in .agent/config.json.");
      }
    } finally {
      await login.close();
    }
  } finally {
    rl.close();
  }
}

async function resolveGoogleCredentials(
  answer: string,
  existingClientId: string | undefined,
  existingClientSecret: string | undefined,
  rl: ReturnType<typeof createInterface>
): Promise<{ clientId?: string; clientSecret?: string }> {
  const normalizedAnswer = stripOuterQuotes(answer);

  if (!normalizedAnswer && existingClientId && existingClientSecret) {
    return { clientId: existingClientId, clientSecret: existingClientSecret };
  }

  if (normalizedAnswer.toLowerCase().endsWith(".json")) {
    return readGoogleClientSecretJson(normalizedAnswer);
  }

  if (!normalizedAnswer && (!existingClientId || !existingClientSecret)) {
    return {};
  }

  const clientSecret = await rl.question("Google OAuth client secret: ");
  return {
    clientId: normalizedAnswer || existingClientId,
    clientSecret: clientSecret.trim() || existingClientSecret
  };
}

async function readGoogleClientSecretJson(filePath: string): Promise<{ clientId?: string; clientSecret?: string }> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as {
    installed?: { client_id?: string; client_secret?: string };
    web?: { client_id?: string; client_secret?: string };
  };
  const credentials = parsed.installed ?? parsed.web;
  if (!credentials?.client_id || !credentials.client_secret) {
    throw new Error("Google OAuth JSON did not contain installed.client_id/client_secret or web.client_id/client_secret.");
  }
  return {
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret
  };
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function chat(config: AppConfig): Promise<void> {
  const provider = createProvider(config.provider);
  const sessionStore = new SessionStore(config.workspaceRoot);
  const session = await sessionStore.create(config);
  await sessionStore.save(session);

  logger.info("Arnold chat started. Type /exit to quit.");
  logger.info(describeRun(config.provider, config.workspaceRoot));

  const rl = createInterface({ input, output });
  const loop = new AgentLoop(config, provider, sessionStore, session);

  try {
    while (true) {
      const text = await askQuestion(rl, "\nYou: ");
      if (text === undefined) {
        break;
      }
      const trimmed = text.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed === "/exit" || trimmed === "/quit") {
        logger.info("Goodbye.");
        break;
      }

      try {
        const answer = await loop.runUserTurn(trimmed);
        logger.info(`\nArnold: ${answer}`);
      } catch (error) {
        logger.error(`\nArnold error: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  } finally {
    rl.close();
  }
}

async function askQuestion(
  rl: ReturnType<typeof createInterface>,
  query: string
): Promise<string | undefined> {
  try {
    return await rl.question(query);
  } catch (error) {
    if (error instanceof Error && error.message.includes("readline was closed")) {
      return undefined;
    }
    throw error;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { rest: [] };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    if (arg === "--provider") {
      parsed.provider = parseProvider(argv[++i]);
      continue;
    }
    if (arg === "--approval") {
      parsed.approvalMode = parseApprovalMode(argv[++i]);
      continue;
    }
    if (arg === "--workspace") {
      parsed.workspaceRoot = argv[++i];
      continue;
    }
  }

  parsed.command = positionals[0];
  parsed.subcommand = positionals[1];
  parsed.action = positionals[2];
  parsed.rest = positionals.slice(2);
  return parsed;
}

function parseProvider(value: string | undefined): ProviderName {
  if (value === "mock" || value === "codex-cli") {
    return value;
  }
  throw new Error("--provider must be mock or codex-cli.");
}

function parseApprovalMode(value: string | undefined): ApprovalMode {
  if (value === "suggest" || value === "confirm" || value === "auto") {
    return value;
  }
  throw new Error("--approval must be suggest, confirm, or auto.");
}

function printHelp(): void {
  logger.info(`Arnold local agent

Usage:
  agent chat [--provider mock|codex-cli] [--approval suggest|confirm|auto] [--workspace path]
  agent config [--workspace path]
  agent connectors
  agent auth gmail login|status|logout
  agent auth telegram token|status|logout
  agent auth discord token|status|logout
  agent telegram listen
  agent discord listen
  agent discord ensure-channels [channel-name...]

Commands:
  chat        Start an interactive terminal chat
  config      Print the current config, creating .agent/config.json if needed
  connectors  List installed connectors and their tools
  auth        Configure connector authentication
  telegram    Run the Telegram bot listener
  discord     Run the Discord bot listener

Examples:
  agent chat
  agent chat --provider mock --approval confirm
  agent config --workspace .
  agent auth gmail status
  agent auth telegram token
  agent telegram listen
  agent auth discord token
  agent discord listen
  agent discord ensure-channels general internship-tracker uni-tracker
`);
}

main().catch((error) => {
  logger.error(error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
