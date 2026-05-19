export type InternshipApplicationStatus =
  | "applied"
  | "confirmation"
  | "rejected"
  | "interview"
  | "action_required"
  | "deadline"
  | "offer"
  | "unknown";

export interface InternshipApplication {
  id: string;
  company: string;
  role: string;
  status: InternshipApplicationStatus;
  source: "gmail" | "manual";
  location?: string;
  link?: string;
  deadline?: string;
  nextAction?: string;
  notes: string[];
  gmailMessageIds: string[];
  firstSeenAt: string;
  updatedAt: string;
}

export interface InternshipOpportunity {
  id: string;
  title: string;
  company?: string;
  location?: string;
  url: string;
  sourceName: string;
  summary: string;
  fitScore: number;
  confidence: "high" | "medium" | "low";
  discoveredAt: string;
  lastSeenAt: string;
  status: "new" | "seen" | "saved" | "dismissed";
}

export interface InternshipSource {
  name: string;
  url: string;
  enabled: boolean;
  kind: "job-board" | "program" | "employer";
}

export interface InternshipRadarSettings {
  timezone: string;
  dailyBriefTime: string;
  delivery: {
    discord: boolean;
    discordChannelId?: string;
  };
  profile: {
    focus: string;
    locations: string[];
    keywords: string[];
    excludeKeywords: string[];
    employerWatchlist: string[];
  };
  gmail: {
    queryWindow: string;
    maxMessages: number;
  };
  sources: InternshipSource[];
}

export interface InternshipStores {
  settings: InternshipRadarSettings;
  applications: InternshipApplication[];
  opportunities: InternshipOpportunity[];
}

export interface EmailScanResult {
  scanned: number;
  matched: number;
  applicationsChanged: number;
  updates: string[];
  warnings: string[];
}

export interface DiscoveryResult {
  sourcesChecked: number;
  discovered: number;
  updated: number;
  warnings: string[];
}

export interface BriefResult {
  path: string;
  markdown: string;
  postedToDiscord: boolean;
}
