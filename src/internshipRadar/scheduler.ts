import type { AppConfig } from "../config/config.js";
import { logger } from "../utils/logger.js";
import { runDailyInternshipRadar } from "./runner.js";
import { loadInternshipStores, appendActivity } from "./store.js";

export async function runInternshipRadarScheduler(config: AppConfig): Promise<void> {
  const stores = await loadInternshipStores(config.workspaceRoot);
  const targetTime = stores.settings.dailyBriefTime;
  let lastRunKey: string | undefined;

  logger.info(`Internship Radar scheduler online. Daily brief time: ${targetTime} ${stores.settings.timezone}.`);
  await appendActivity(config.workspaceRoot, `Scheduler started for ${targetTime} ${stores.settings.timezone}.`);

  while (true) {
    const now = new Date();
    const currentTime = formatTime(now, stores.settings.timezone);
    const runKey = formatDate(now, stores.settings.timezone);
    if (currentTime >= targetTime && lastRunKey !== runKey) {
      lastRunKey = runKey;
      try {
        await runDailyInternshipRadar(config, { postToDiscord: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown scheduler error.";
        logger.error(`Internship Radar daily run failed: ${message}`);
        await appendActivity(config.workspaceRoot, `Scheduler daily run failed: ${message}`);
      }
    }
    await sleep(60_000);
  }
}

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-NZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone
  }).format(date);
}

function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone
  }).format(date);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
