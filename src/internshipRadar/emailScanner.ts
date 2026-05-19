import type { AppConfig } from "../config/config.js";
import { readGmailMessage, searchGmail, type GmailMessage } from "../connectors/gmailClient.js";
import {
  appendActivity,
  loadInternshipStores,
  saveApplications
} from "./store.js";
import type {
  EmailScanResult,
  InternshipApplication,
  InternshipApplicationStatus
} from "./types.js";

export async function scanInternshipEmail(config: AppConfig): Promise<EmailScanResult> {
  const stores = await loadInternshipStores(config.workspaceRoot);
  const warnings: string[] = [];
  if (!config.connectors.gmail.enabled) {
    warnings.push("Gmail connector is disabled in .agent/config.json.");
    await appendActivity(config.workspaceRoot, "Email scan skipped because Gmail is disabled.");
    return { scanned: 0, matched: 0, applicationsChanged: 0, updates: [], warnings };
  }

  const query = buildGmailQuery(stores.settings.gmail.queryWindow);
  const results = await searchGmail(config, query, stores.settings.gmail.maxMessages);
  let changed = 0;
  let matched = 0;
  const updates: string[] = [];
  const applications = [...stores.applications];

  for (const result of results) {
    if (applications.some((application) => application.gmailMessageIds.includes(result.id))) {
      continue;
    }

    const message = await readGmailMessage(config, result.id);
    const classification = classifyInternshipMessage(message);
    if (!classification.isRelevant) {
      continue;
    }

    matched += 1;
    const existingIndex = findApplicationIndex(applications, classification.company, classification.role);
    const now = new Date().toISOString();
    const note = `${classification.status}: ${message.subject ?? "(no subject)"}${message.date ? ` (${message.date})` : ""}`;

    if (existingIndex >= 0) {
      const existing = applications[existingIndex];
      applications[existingIndex] = {
        ...existing,
        company: preferKnown(existing.company, classification.company),
        role: preferKnown(existing.role, classification.role),
        status: classification.status,
        deadline: classification.deadline ?? existing.deadline,
        nextAction: classification.nextAction ?? existing.nextAction,
        notes: appendUnique(existing.notes, note),
        gmailMessageIds: appendUnique(existing.gmailMessageIds, message.id),
        updatedAt: now
      };
      updates.push(`${applications[existingIndex].company} - ${applications[existingIndex].role}: ${classification.status}`);
    } else {
      applications.push({
        id: makeApplicationId(classification.company, classification.role, message.id),
        company: classification.company,
        role: classification.role,
        status: classification.status,
        source: "gmail",
        deadline: classification.deadline,
        nextAction: classification.nextAction,
        notes: [note],
        gmailMessageIds: [message.id],
        firstSeenAt: now,
        updatedAt: now
      });
      updates.push(`${classification.company} - ${classification.role}: ${classification.status}`);
    }
    changed += 1;
  }

  if (changed > 0) {
    await saveApplications(config.workspaceRoot, sortApplications(applications));
  }
  await appendActivity(
    config.workspaceRoot,
    `Email scan complete: scanned ${results.length}, matched ${matched}, changed ${changed}.`
  );

  return {
    scanned: results.length,
    matched,
    applicationsChanged: changed,
    updates,
    warnings
  };
}

interface Classification {
  isRelevant: boolean;
  company: string;
  role: string;
  status: InternshipApplicationStatus;
  deadline?: string;
  nextAction?: string;
}

function buildGmailQuery(window: string): string {
  return [
    window,
    "(internship OR intern OR application OR recruiter OR interview OR graduate OR careers)",
    "-category:promotions"
  ].join(" ");
}

function classifyInternshipMessage(message: GmailMessage): Classification {
  const text = normalizeText([
    message.subject,
    message.from,
    message.snippet,
    message.body.slice(0, 4000)
  ].filter(Boolean).join(" "));

  const isRelevant = [
    "internship",
    "intern",
    "application",
    "interview",
    "recruiter",
    "graduate programme",
    "summer student",
    "careers"
  ].some((keyword) => text.includes(keyword));

  if (!isRelevant) {
    return {
      isRelevant: false,
      company: "Unknown company",
      role: "Unknown role",
      status: "unknown"
    };
  }

  return {
    isRelevant: true,
    company: guessCompany(message),
    role: guessRole(message),
    status: classifyStatus(text),
    deadline: guessDeadline(message.body),
    nextAction: guessNextAction(text)
  };
}

function classifyStatus(text: string): InternshipApplicationStatus {
  if (containsAny(text, ["offer", "pleased to offer", "employment agreement"])) {
    return "offer";
  }
  if (containsAny(text, ["interview", "phone screen", "assessment centre", "assessment center", "meet with"])) {
    return "interview";
  }
  if (containsAny(text, ["unfortunately", "not be progressing", "not selected", "unsuccessful", "regret to inform"])) {
    return "rejected";
  }
  if (containsAny(text, ["action required", "please complete", "complete your", "deadline", "due by", "respond by"])) {
    return "action_required";
  }
  if (containsAny(text, ["closing date", "applications close", "deadline"])) {
    return "deadline";
  }
  if (containsAny(text, ["received your application", "application received", "thank you for applying", "thanks for applying"])) {
    return "confirmation";
  }
  if (containsAny(text, ["submitted", "applied"])) {
    return "applied";
  }
  return "unknown";
}

function guessCompany(message: GmailMessage): string {
  const from = message.from ?? "";
  const displayName = from.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim();
  if (displayName && !displayName.includes("@")) {
    return cleanCompany(displayName);
  }
  const domain = from.match(/@([^>\s]+)/)?.[1]?.split(".").slice(0, -1).join(".");
  if (domain) {
    return cleanCompany(domain.split(".").pop() ?? domain);
  }
  return "Unknown company";
}

function guessRole(message: GmailMessage): string {
  const subject = message.subject ?? "";
  const roleMatch = subject.match(/(?:for|re:|application:?|role:?|position:?)\s+(.+)/i)?.[1];
  const candidate = roleMatch ?? subject;
  const cleaned = candidate
    .replace(/^(re|fw|fwd):\s*/i, "")
    .replace(/application|received|thank you|thanks for applying|interview/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Internship application";
}

function guessDeadline(body: string): string | undefined {
  const match = body.match(/\b(?:by|before|deadline|due|close[s]?)\s+([A-Z][a-z]+ \d{1,2}(?:,? \d{4})?|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  return match?.[1];
}

function guessNextAction(text: string): string | undefined {
  if (containsAny(text, ["interview", "phone screen"])) {
    return "Prepare for interview and confirm the time if needed.";
  }
  if (containsAny(text, ["please complete", "action required", "respond by", "due by"])) {
    return "Review the email and complete the requested action.";
  }
  if (containsAny(text, ["deadline", "applications close"])) {
    return "Check the deadline and decide whether to apply.";
  }
  if (containsAny(text, ["received your application", "thank you for applying"])) {
    return "Wait for next update; follow up if stale after two weeks.";
  }
  return undefined;
}

function findApplicationIndex(applications: InternshipApplication[], company: string, role: string): number {
  const normalizedCompany = normalizeKey(company);
  const normalizedRole = normalizeKey(role);
  return applications.findIndex((application) => {
    const appCompany = normalizeKey(application.company);
    const appRole = normalizeKey(application.role);
    return appCompany === normalizedCompany || (appCompany === normalizedCompany && appRole === normalizedRole);
  });
}

function makeApplicationId(company: string, role: string, messageId: string): string {
  return `${slugify(company)}-${slugify(role) || "application"}-${messageId.slice(0, 8)}`;
}

function sortApplications(applications: InternshipApplication[]): InternshipApplication[] {
  return applications.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function cleanCompany(value: string): string {
  return value
    .replace(/careers|recruitment|talent|notifications|no.?reply|noreply/gi, "")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Unknown company";
}

function preferKnown(current: string, next: string): string {
  return current === "Unknown company" || current === "Unknown role" ? next : current;
}

function appendUnique<T>(items: T[], item: T): T[] {
  return items.includes(item) ? items : [...items, item];
}
