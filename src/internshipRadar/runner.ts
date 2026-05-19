import type { AppConfig } from "../config/config.js";
import { logger } from "../utils/logger.js";
import { generateInternshipBrief } from "./brief.js";
import { discoverInternships } from "./discovery.js";
import { scanInternshipEmail } from "./emailScanner.js";
import { appendActivity, ensureInternshipRadarStore, loadInternshipStores } from "./store.js";
import type { BriefResult, DiscoveryResult, EmailScanResult } from "./types.js";

export interface DailyRunResult {
  emailScan: EmailScanResult;
  discovery: DiscoveryResult;
  brief: BriefResult;
}

export async function runDailyInternshipRadar(
  config: AppConfig,
  options: { postToDiscord: boolean }
): Promise<DailyRunResult> {
  await ensureInternshipRadarStore(config.workspaceRoot);
  await appendActivity(config.workspaceRoot, "Daily run started.");
  const emailScan = await scanInternshipEmail(config);
  const discovery = await discoverInternships(config);
  const brief = await generateInternshipBrief(config, {
    emailScan,
    discovery,
    postToDiscord: options.postToDiscord
  });
  await appendActivity(config.workspaceRoot, "Daily run finished.");
  return { emailScan, discovery, brief };
}

export async function printInternshipRadarStatus(config: AppConfig): Promise<void> {
  const stores = await loadInternshipStores(config.workspaceRoot);
  const activeApplications = stores.applications.filter((item) =>
    item.status !== "rejected" && item.status !== "unknown"
  );
  const newOpportunities = stores.opportunities.filter((item) => item.status === "new");

  logger.info("Internship Radar");
  logger.info(`- Focus: ${stores.settings.profile.focus}`);
  logger.info(`- Daily brief: ${stores.settings.dailyBriefTime} ${stores.settings.timezone}`);
  logger.info(`- Delivery: ${stores.settings.delivery.discord ? "Discord" : "local brief only"}`);
  logger.info(`- Sources enabled: ${stores.settings.sources.filter((item) => item.enabled).length}`);
  logger.info(`- Applications tracked: ${stores.applications.length}`);
  logger.info(`- Active applications: ${activeApplications.length}`);
  logger.info(`- Opportunities stored: ${stores.opportunities.length}`);
  logger.info(`- New opportunities: ${newOpportunities.length}`);
}
