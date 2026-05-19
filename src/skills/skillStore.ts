import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { resolveInsideWorkspace } from "../utils/paths.js";

export interface SkillSummary {
  name: string;
  title: string;
  description: string;
  path: string;
}

export interface Skill extends SkillSummary {
  content: string;
}

export async function listSkills(workspaceRoot: string): Promise<SkillSummary[]> {
  const skillsDir = skillsRoot(workspaceRoot);
  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const summaries: SkillSummary[] = [];
  for (const name of entries) {
    if (!isValidSkillName(name)) {
      continue;
    }
    const relativePath = skillPath(name);
    try {
      const content = await readFile(resolveInsideWorkspace(workspaceRoot, relativePath), "utf8");
      summaries.push({
        name,
        title: extractTitle(content, name),
        description: extractDescription(content),
        path: relativePath
      });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }
  return summaries.sort((left, right) => left.name.localeCompare(right.name));
}

export async function readSkill(workspaceRoot: string, name: string): Promise<Skill> {
  const skillName = normalizeSkillName(name);
  const relativePath = skillPath(skillName);
  const content = await readFile(resolveInsideWorkspace(workspaceRoot, relativePath), "utf8");
  return {
    name: skillName,
    title: extractTitle(content, skillName),
    description: extractDescription(content),
    path: relativePath,
    content
  };
}

function skillsRoot(workspaceRoot: string): string {
  return resolveInsideWorkspace(workspaceRoot, "skills");
}

function skillPath(name: string): string {
  return path.posix.join("skills", name, "SKILL.md");
}

function normalizeSkillName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!isValidSkillName(normalized)) {
    throw new Error("Invalid skill name. Use lowercase letters, numbers, and hyphens.");
  }
  return normalized;
}

function isValidSkillName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(name);
}

function extractTitle(content: string, fallbackName: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallbackName;
}

function extractDescription(content: string): string {
  const lines = content.split(/\r?\n/);
  const purposeIndex = lines.findIndex((line) => /^##\s+Purpose\s*$/i.test(line.trim()));
  if (purposeIndex >= 0) {
    const paragraph = nextParagraph(lines.slice(purposeIndex + 1));
    if (paragraph) {
      return paragraph;
    }
  }
  return nextParagraph(lines) ?? "No description provided.";
}

function nextParagraph(lines: string[]): string | undefined {
  const paragraph: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }
    if (trimmed.startsWith("- ")) {
      continue;
    }
    paragraph.push(trimmed);
  }
  return paragraph.join(" ").slice(0, 240) || undefined;
}
