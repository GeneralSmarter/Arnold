import type { Tool } from "./types.js";
import { runDailyInternshipRadar } from "../internshipRadar/runner.js";
import { loadInternshipStores } from "../internshipRadar/store.js";

export const internshipStatusTool: Tool = {
  name: "internship_status",
  description: "Show Internship Radar status from local filesystem state.",
  risky: false,
  async run(_input, context) {
    try {
      const stores = await loadInternshipStores(context.config.workspaceRoot);
      const activeApplications = stores.applications.filter((item) =>
        item.status !== "rejected" && item.status !== "unknown"
      );
      const newOpportunities = stores.opportunities.filter((item) => item.status === "new");
      return {
        ok: true,
        content: [
          "Internship Radar status:",
          `- Focus: ${stores.settings.profile.focus}`,
          `- Daily brief: ${stores.settings.dailyBriefTime} ${stores.settings.timezone}`,
          `- Delivery: ${stores.settings.delivery.discord ? "Discord" : "local brief only"}`,
          `- Sources enabled: ${stores.settings.sources.filter((item) => item.enabled).length}`,
          `- Applications tracked: ${stores.applications.length}`,
          `- Active applications: ${activeApplications.length}`,
          `- Opportunities stored: ${stores.opportunities.length}`,
          `- New opportunities: ${newOpportunities.length}`
        ].join("\n")
      };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to read Internship Radar status." };
    }
  }
};

export const internshipScanTool: Tool = {
  name: "internship_scan",
  description: "Run Internship Radar locally without posting to Discord or sending outbound messages.",
  risky: false,
  async run(_input, context) {
    try {
      const result = await runDailyInternshipRadar(context.config, { postToDiscord: false });
      return {
        ok: true,
        content: [
          "Internship Radar scan complete.",
          `Email scan: ${result.emailScan.scanned} scanned, ${result.emailScan.matched} relevant, ${result.emailScan.applicationsChanged} changed`,
          `Discovery: ${result.discovery.sourcesChecked} sources, ${result.discovery.discovered} new, ${result.discovery.updated} updated`,
          `Brief saved: ${result.brief.path}`,
          "No Discord post, email, application, or outbound message was sent.",
          "",
          result.brief.markdown
        ].join("\n")
      };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to scan Internship Radar." };
    }
  }
};

export const internshipRunDailyTool: Tool = {
  name: "internship_run_daily",
  description: "Run Internship Radar daily workflow. Defaults to dry-run; set postToDiscord=true only with approval.",
  risky: true,
  approvalPreview(input) {
    return `Run Internship Radar daily workflow\npostToDiscord: ${input.postToDiscord === true ? "true" : "false"}`;
  },
  async run(input, context) {
    try {
      const postToDiscord = input.postToDiscord === true;
      const result = await runDailyInternshipRadar(context.config, { postToDiscord });
      return {
        ok: true,
        content: [
          `Email scan: ${result.emailScan.scanned} scanned, ${result.emailScan.matched} relevant, ${result.emailScan.applicationsChanged} changed`,
          `Discovery: ${result.discovery.sourcesChecked} sources, ${result.discovery.discovered} new, ${result.discovery.updated} updated`,
          `Brief saved: ${result.brief.path}`,
          result.brief.postedToDiscord ? "Posted to Discord." : "Dry-run only; not posted to Discord.",
          "",
          result.brief.markdown
        ].join("\n")
      };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to run Internship Radar." };
    }
  }
};
