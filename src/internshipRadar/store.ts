import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { getAgentDir } from "../config/config.js";
import type {
  InternshipApplication,
  InternshipOpportunity,
  InternshipRadarSettings,
  InternshipStores
} from "./types.js";

const RADAR_DIR = "internship-radar";

export function getInternshipRadarDir(workspaceRoot: string): string {
  return path.join(getAgentDir(workspaceRoot), RADAR_DIR);
}

export function getDailyBriefsDir(workspaceRoot: string): string {
  return path.join(getInternshipRadarDir(workspaceRoot), "daily-briefs");
}

export async function ensureInternshipRadarStore(workspaceRoot: string): Promise<void> {
  await mkdir(getDailyBriefsDir(workspaceRoot), { recursive: true });
  await ensureJsonFile(settingsPath(workspaceRoot), defaultSettings());
  await ensureJsonFile(applicationsPath(workspaceRoot), []);
  await ensureJsonFile(opportunitiesPath(workspaceRoot), []);
}

export async function loadInternshipStores(workspaceRoot: string): Promise<InternshipStores> {
  await ensureInternshipRadarStore(workspaceRoot);
  return {
    settings: await readJson<InternshipRadarSettings>(settingsPath(workspaceRoot)),
    applications: await readJson<InternshipApplication[]>(applicationsPath(workspaceRoot)),
    opportunities: await readJson<InternshipOpportunity[]>(opportunitiesPath(workspaceRoot))
  };
}

export async function saveApplications(workspaceRoot: string, applications: InternshipApplication[]): Promise<void> {
  await writeJson(applicationsPath(workspaceRoot), applications);
}

export async function saveOpportunities(workspaceRoot: string, opportunities: InternshipOpportunity[]): Promise<void> {
  await writeJson(opportunitiesPath(workspaceRoot), opportunities);
}

export async function saveDailyBrief(workspaceRoot: string, markdown: string, now = new Date()): Promise<string> {
  const fileName = `${now.toISOString().slice(0, 10)}.md`;
  const filePath = path.join(getDailyBriefsDir(workspaceRoot), fileName);
  await writeFile(filePath, `${markdown.trim()}\n`, "utf8");
  return filePath;
}

export async function appendActivity(workspaceRoot: string, message: string, now = new Date()): Promise<void> {
  await ensureInternshipRadarStore(workspaceRoot);
  await appendFile(activityLogPath(workspaceRoot), `[${now.toISOString()}] ${message}\n`, "utf8");
}

function settingsPath(workspaceRoot: string): string {
  return path.join(getInternshipRadarDir(workspaceRoot), "sources.json");
}

function applicationsPath(workspaceRoot: string): string {
  return path.join(getInternshipRadarDir(workspaceRoot), "applications.json");
}

function opportunitiesPath(workspaceRoot: string): string {
  return path.join(getInternshipRadarDir(workspaceRoot), "opportunities.json");
}

function activityLogPath(workspaceRoot: string): string {
  return path.join(getInternshipRadarDir(workspaceRoot), "activity.log");
}

async function ensureJsonFile<T>(filePath: string, value: T): Promise<void> {
  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeJson(filePath, value);
      return;
    }
    throw error;
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid Internship Radar JSON at ${filePath}`);
  }
}

async function writeJson<T>(filePath: string, value: T): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function defaultSettings(): InternshipRadarSettings {
  return {
    timezone: "Pacific/Auckland",
    dailyBriefTime: "08:00",
    delivery: {
      discord: true
    },
    profile: {
      focus: "Mechatronics internships in New Zealand plus remote roles",
      locations: ["New Zealand", "Remote"],
      keywords: [
        "mechatronics",
        "robotics",
        "automation",
        "mechanical",
        "electrical",
        "electronics",
        "embedded",
        "controls",
        "manufacturing",
        "internship",
        "summer internship",
        "student engineer"
      ],
      excludeKeywords: ["senior", "principal", "manager", "unpaid"],
      employerWatchlist: [
        "Beca",
        "WSP",
        "Fisher & Paykel Healthcare",
        "Meridian",
        "Syos Aerospace",
        "TOMRA",
        "Kitea Health"
      ]
    },
    gmail: {
      queryWindow: "newer_than:30d",
      maxMessages: 20
    },
    sources: [
      {
        name: "Summer of Tech Candidates",
        url: "https://www.summeroftech.co.nz/candidates",
        enabled: true,
        kind: "program"
      },
      {
        name: "Prosple NZ",
        url: "https://nz.prosple.com/",
        enabled: true,
        kind: "job-board"
      },
      {
        name: "SEEK Grad NZ",
        url: "https://nz.gradconnection.com/",
        enabled: true,
        kind: "job-board"
      },
      {
        name: "SEEK Mechatronics Internships",
        url: "https://www.seek.co.nz/mechatronics-internship-jobs",
        enabled: true,
        kind: "job-board"
      }
    ]
  };
}
