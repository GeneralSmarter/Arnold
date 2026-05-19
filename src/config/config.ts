import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProviderName } from "../providers/types.js";

export type ApprovalMode = "suggest" | "confirm" | "auto";

export interface AppConfig {
  provider: ProviderName;
  approvalMode: ApprovalMode;
  workspaceRoot: string;
  connectors: ConnectorConfig;
}

export interface ConnectorConfig {
  gmail: GmailConnectorConfig;
  web: WebConnectorConfig;
  telegram: TelegramConnectorConfig;
  discord: DiscordConnectorConfig;
}

export interface GmailConnectorConfig {
  enabled: boolean;
  defaultSearchLimit: number;
}

export interface WebConnectorConfig {
  enabled: boolean;
  maxBytes: number;
  maxRedirects: number;
  blockedHosts: string[];
  allowedDomains: string[];
}

export interface TelegramConnectorConfig {
  enabled: boolean;
  allowedChatIds: string[];
  pollTimeoutSeconds: number;
}

export interface DiscordConnectorConfig {
  enabled: boolean;
  allowedGuildIds: string[];
  allowedChannelIds: string[];
  commandPrefix: string;
}

const CONFIG_DIR = ".agent";
const CONFIG_FILE = "config.json";

export function getAgentDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, CONFIG_DIR);
}

export function getConfigPath(workspaceRoot: string): string {
  return path.join(getAgentDir(workspaceRoot), CONFIG_FILE);
}

export async function loadConfig(baseDir = process.cwd()): Promise<AppConfig> {
  const configPath = getConfigPath(baseDir);

  try {
    const raw = await readFile(configPath, "utf8");
    return validateConfig(JSON.parse(raw));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      const config = defaultConfig(baseDir);
      await saveConfig(config);
      return config;
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid config JSON at ${configPath}`);
    }
    throw error;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const agentDir = getAgentDir(config.workspaceRoot);
  await mkdir(agentDir, { recursive: true });
  await writeFile(getConfigPath(config.workspaceRoot), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function defaultConfig(workspaceRoot: string): AppConfig {
  return {
    provider: "mock",
    approvalMode: "confirm",
    workspaceRoot: path.resolve(workspaceRoot),
    connectors: defaultConnectorConfig()
  };
}

export function validateConfig(value: unknown): AppConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid config: expected an object.");
  }
  const config = value as Record<string, unknown>;
  if (config.provider !== "mock" && config.provider !== "codex-cli") {
    throw new Error("Invalid config: provider must be mock or codex-cli.");
  }
  if (
    config.approvalMode !== "suggest" &&
    config.approvalMode !== "confirm" &&
    config.approvalMode !== "auto"
  ) {
    throw new Error("Invalid config: approvalMode must be suggest, confirm, or auto.");
  }
  if (typeof config.workspaceRoot !== "string" || !config.workspaceRoot) {
    throw new Error("Invalid config: workspaceRoot must be a string.");
  }
  return {
    provider: config.provider,
    approvalMode: config.approvalMode,
    workspaceRoot: path.resolve(config.workspaceRoot),
    connectors: validateConnectorConfig(config.connectors)
  };
}

export function applyConfigOverrides(
  config: AppConfig,
  overrides: Partial<AppConfig>
): AppConfig {
  return validateConfig({
    provider: overrides.provider ?? config.provider,
    approvalMode: overrides.approvalMode ?? config.approvalMode,
    workspaceRoot: overrides.workspaceRoot ? path.resolve(overrides.workspaceRoot) : config.workspaceRoot,
    connectors: overrides.connectors ?? config.connectors
  });
}

function defaultConnectorConfig(): ConnectorConfig {
  return {
    gmail: {
      enabled: false,
      defaultSearchLimit: 10
    },
    web: {
      enabled: true,
      maxBytes: 500_000,
      maxRedirects: 3,
      blockedHosts: ["localhost", "127.0.0.1", "::1"],
      allowedDomains: []
    },
    telegram: {
      enabled: false,
      allowedChatIds: [],
      pollTimeoutSeconds: 25
    },
    discord: {
      enabled: false,
      allowedGuildIds: [],
      allowedChannelIds: [],
      commandPrefix: "!"
    }
  };
}

function validateConnectorConfig(value: unknown): ConnectorConfig {
  const defaults = defaultConnectorConfig();
  if (value === undefined) {
    return defaults;
  }
  if (!value || typeof value !== "object") {
    throw new Error("Invalid config: connectors must be an object.");
  }
  const connectors = value as Record<string, unknown>;
  return {
    gmail: validateGmailConnectorConfig(connectors.gmail, defaults.gmail),
    web: validateWebConnectorConfig(connectors.web, defaults.web),
    telegram: validateTelegramConnectorConfig(connectors.telegram, defaults.telegram),
    discord: validateDiscordConnectorConfig(connectors.discord, defaults.discord)
  };
}

function validateGmailConnectorConfig(
  value: unknown,
  defaults: GmailConnectorConfig
): GmailConnectorConfig {
  if (value === undefined) {
    return defaults;
  }
  if (!value || typeof value !== "object") {
    throw new Error("Invalid config: connectors.gmail must be an object.");
  }
  const config = value as Record<string, unknown>;
  const enabled = config.enabled ?? defaults.enabled;
  const defaultSearchLimit = config.defaultSearchLimit ?? defaults.defaultSearchLimit;
  if (typeof enabled !== "boolean") {
    throw new Error("Invalid config: connectors.gmail.enabled must be a boolean.");
  }
  if (
    typeof defaultSearchLimit !== "number" ||
    !Number.isInteger(defaultSearchLimit) ||
    defaultSearchLimit < 1 ||
    defaultSearchLimit > 50
  ) {
    throw new Error("Invalid config: connectors.gmail.defaultSearchLimit must be an integer from 1 to 50.");
  }
  return { enabled, defaultSearchLimit };
}

function validateWebConnectorConfig(
  value: unknown,
  defaults: WebConnectorConfig
): WebConnectorConfig {
  if (value === undefined) {
    return defaults;
  }
  if (!value || typeof value !== "object") {
    throw new Error("Invalid config: connectors.web must be an object.");
  }
  const config = value as Record<string, unknown>;
  const enabled = config.enabled ?? defaults.enabled;
  const maxBytes = config.maxBytes ?? defaults.maxBytes;
  const maxRedirects = config.maxRedirects ?? defaults.maxRedirects;
  const blockedHosts = config.blockedHosts ?? defaults.blockedHosts;
  const allowedDomains = config.allowedDomains ?? defaults.allowedDomains;

  if (typeof enabled !== "boolean") {
    throw new Error("Invalid config: connectors.web.enabled must be a boolean.");
  }
  if (typeof maxBytes !== "number" || !Number.isInteger(maxBytes) || maxBytes < 10_000 || maxBytes > 5_000_000) {
    throw new Error("Invalid config: connectors.web.maxBytes must be an integer from 10000 to 5000000.");
  }
  if (
    typeof maxRedirects !== "number" ||
    !Number.isInteger(maxRedirects) ||
    maxRedirects < 0 ||
    maxRedirects > 10
  ) {
    throw new Error("Invalid config: connectors.web.maxRedirects must be an integer from 0 to 10.");
  }
  if (!isStringArray(blockedHosts)) {
    throw new Error("Invalid config: connectors.web.blockedHosts must be a string array.");
  }
  if (!isStringArray(allowedDomains)) {
    throw new Error("Invalid config: connectors.web.allowedDomains must be a string array.");
  }

  return { enabled, maxBytes, maxRedirects, blockedHosts, allowedDomains };
}

function validateTelegramConnectorConfig(
  value: unknown,
  defaults: TelegramConnectorConfig
): TelegramConnectorConfig {
  if (value === undefined) {
    return defaults;
  }
  if (!value || typeof value !== "object") {
    throw new Error("Invalid config: connectors.telegram must be an object.");
  }
  const config = value as Record<string, unknown>;
  const enabled = config.enabled ?? defaults.enabled;
  const allowedChatIds = config.allowedChatIds ?? defaults.allowedChatIds;
  const pollTimeoutSeconds = config.pollTimeoutSeconds ?? defaults.pollTimeoutSeconds;

  if (typeof enabled !== "boolean") {
    throw new Error("Invalid config: connectors.telegram.enabled must be a boolean.");
  }
  if (!isStringArray(allowedChatIds)) {
    throw new Error("Invalid config: connectors.telegram.allowedChatIds must be a string array.");
  }
  if (
    typeof pollTimeoutSeconds !== "number" ||
    !Number.isInteger(pollTimeoutSeconds) ||
    pollTimeoutSeconds < 1 ||
    pollTimeoutSeconds > 50
  ) {
    throw new Error("Invalid config: connectors.telegram.pollTimeoutSeconds must be an integer from 1 to 50.");
  }

  return { enabled, allowedChatIds, pollTimeoutSeconds };
}

function validateDiscordConnectorConfig(
  value: unknown,
  defaults: DiscordConnectorConfig
): DiscordConnectorConfig {
  if (value === undefined) {
    return defaults;
  }
  if (!value || typeof value !== "object") {
    throw new Error("Invalid config: connectors.discord must be an object.");
  }
  const config = value as Record<string, unknown>;
  const enabled = config.enabled ?? defaults.enabled;
  const allowedGuildIds = config.allowedGuildIds ?? defaults.allowedGuildIds;
  const allowedChannelIds = config.allowedChannelIds ?? defaults.allowedChannelIds;
  const commandPrefix = config.commandPrefix ?? defaults.commandPrefix;

  if (typeof enabled !== "boolean") {
    throw new Error("Invalid config: connectors.discord.enabled must be a boolean.");
  }
  if (!isStringArray(allowedGuildIds)) {
    throw new Error("Invalid config: connectors.discord.allowedGuildIds must be a string array.");
  }
  if (!isStringArray(allowedChannelIds)) {
    throw new Error("Invalid config: connectors.discord.allowedChannelIds must be a string array.");
  }
  if (typeof commandPrefix !== "string" || commandPrefix.length < 1 || commandPrefix.length > 8) {
    throw new Error("Invalid config: connectors.discord.commandPrefix must be a string from 1 to 8 characters.");
  }

  return { enabled, allowedGuildIds, allowedChannelIds, commandPrefix };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
