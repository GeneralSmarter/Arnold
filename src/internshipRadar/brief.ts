import type { AppConfig } from "../config/config.js";
import { sendDiscordChannelMessage } from "../connectors/discordClient.js";
import { SecretsStore } from "../secrets/secretsStore.js";
import {
  appendActivity,
  loadInternshipStores,
  saveDailyBrief
} from "./store.js";
import type {
  BriefResult,
  DiscoveryResult,
  EmailScanResult,
  InternshipApplication,
  InternshipApplicationStatus,
  InternshipOpportunity
} from "./types.js";

export interface GenerateBriefInput {
  emailScan?: EmailScanResult;
  discovery?: DiscoveryResult;
  postToDiscord: boolean;
}

export async function generateInternshipBrief(
  config: AppConfig,
  input: GenerateBriefInput
): Promise<BriefResult> {
  const stores = await loadInternshipStores(config.workspaceRoot);
  const markdown = renderBrief({
    applications: stores.applications,
    opportunities: stores.opportunities,
    emailScan: input.emailScan,
    discovery: input.discovery
  });
  const path = await saveDailyBrief(config.workspaceRoot, markdown);

  let postedToDiscord = false;
  if (input.postToDiscord) {
    await postBriefToDiscord(config, markdown, stores.settings.delivery.discordChannelId);
    postedToDiscord = true;
  }

  await appendActivity(
    config.workspaceRoot,
    `Daily brief generated at ${path}${postedToDiscord ? " and posted to Discord" : " as dry-run"}.`
  );

  return { path, markdown, postedToDiscord };
}

async function postBriefToDiscord(
  config: AppConfig,
  markdown: string,
  configuredChannelId: string | undefined
): Promise<void> {
  if (!config.connectors.discord.enabled) {
    throw new Error("Discord connector is disabled in .agent/config.json.");
  }
  const channelId = configuredChannelId ?? config.connectors.discord.allowedChannelIds[0];
  if (!channelId) {
    throw new Error("No Discord channel configured. Add allowedChannelIds or delivery.discordChannelId.");
  }
  const secrets = await new SecretsStore(config.workspaceRoot).load();
  const botToken = secrets.discord?.botToken;
  if (!botToken) {
    throw new Error("Missing Discord bot token. Run: agent auth discord token");
  }
  await sendDiscordChannelMessage(botToken, channelId, markdown);
}

function renderBrief(input: {
  applications: InternshipApplication[];
  opportunities: InternshipOpportunity[];
  emailScan?: EmailScanResult;
  discovery?: DiscoveryResult;
}): string {
  const today = new Date().toLocaleDateString("en-NZ", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Pacific/Auckland"
  });
  const newOpportunities = input.opportunities
    .filter((item) => item.status === "new")
    .slice(0, 5);
  const actions = buildActions(input.applications, newOpportunities);
  const board = countByStatus(input.applications);

  return [
    `# Internship Radar - ${today}`,
    "",
    "## System check",
    `- Email scan: ${formatEmailScan(input.emailScan)}`,
    `- Discovery: ${formatDiscovery(input.discovery)}`,
    `- Tracked applications: ${input.applications.length}`,
    "",
    "## New opportunities",
    newOpportunities.length > 0
      ? newOpportunities.map(formatOpportunity).join("\n")
      : "- No new high-signal opportunities found. System still ran cleanly.",
    "",
    "## Application board",
    formatBoard(board),
    "",
    "## Today's actions",
    actions.length > 0 ? actions.map((action) => `- ${action}`).join("\n") : "- Review saved opportunities and choose one role to investigate.",
    "",
    "## Guardrail",
    "- No applications, replies, or external messages were sent. Anything outbound still needs your approval."
  ].join("\n");
}

function formatEmailScan(result: EmailScanResult | undefined): string {
  if (!result) {
    return "not run for this brief";
  }
  const warning = result.warnings.length > 0 ? `, warnings: ${result.warnings.join("; ")}` : "";
  return `${result.scanned} scanned, ${result.matched} relevant, ${result.applicationsChanged} changed${warning}`;
}

function formatDiscovery(result: DiscoveryResult | undefined): string {
  if (!result) {
    return "not run for this brief";
  }
  const warning = result.warnings.length > 0 ? `, warnings: ${result.warnings.join("; ")}` : "";
  return `${result.sourcesChecked} sources, ${result.discovered} new, ${result.updated} updated${warning}`;
}

function formatOpportunity(item: InternshipOpportunity): string {
  const company = item.company ? `${item.company} - ` : "";
  const location = item.location ? ` (${item.location})` : "";
  return `- ${company}${item.title}${location} [fit ${item.fitScore}, ${item.confidence}] - ${item.url}\n  ${item.summary}`;
}

function countByStatus(applications: InternshipApplication[]): Record<InternshipApplicationStatus, number> {
  const statuses: InternshipApplicationStatus[] = [
    "applied",
    "confirmation",
    "rejected",
    "interview",
    "action_required",
    "deadline",
    "offer",
    "unknown"
  ];
  const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<InternshipApplicationStatus, number>;
  for (const application of applications) {
    counts[application.status] += 1;
  }
  return counts;
}

function formatBoard(board: Record<InternshipApplicationStatus, number>): string {
  return Object.entries(board)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `- ${status}: ${count}`)
    .join("\n") || "- No tracked applications yet.";
}

function buildActions(
  applications: InternshipApplication[],
  opportunities: InternshipOpportunity[]
): string[] {
  const actions: string[] = [];
  for (const application of applications.slice(0, 8)) {
    if (application.status === "interview" || application.status === "action_required" || application.status === "deadline") {
      actions.push(`${application.company} - ${application.role}: ${application.nextAction ?? "Review the latest email."}`);
    }
  }
  for (const opportunity of opportunities.slice(0, 3)) {
    actions.push(`Check ${opportunity.company ? `${opportunity.company} ` : ""}${opportunity.title} and decide whether to apply.`);
  }
  return actions.slice(0, 8);
}
