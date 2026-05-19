import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getSessions, summarize } from "./sessions";
import { fromWorkspace, relativeToWorkspace, workspaceRoot } from "./workspace";

export interface IndexedDoc {
  id: string;
  title: string;
  path: string;
  kind: "markdown" | "session";
  words: number;
  updatedAt: string;
  excerpt: string;
}

const docRoots = ["README.md", "HANDOFF.md", "docs", ".agent/docs"];

export async function getDocs(query = ""): Promise<IndexedDoc[]> {
  const [fileDocs, sessionDocs] = await Promise.all([getFileDocs(), getSessionDocs()]);
  const docs = [...fileDocs, ...sessionDocs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return docs;
  }
  return docs.filter((doc) => `${doc.title} ${doc.path} ${doc.excerpt}`.toLowerCase().includes(normalized));
}

async function getFileDocs() {
  const files: string[] = [];
  for (const root of docRoots) {
    const target = fromWorkspace(root);
    const targetStat = await stat(target).catch(() => undefined);
    if (!targetStat) continue;
    if (targetStat.isFile() && target.endsWith(".md")) files.push(target);
    if (targetStat.isDirectory()) files.push(...await findMarkdown(target));
  }

  return Promise.all(files.map(async (filePath) => {
    const [content, fileStat] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
    return {
      id: relativeToWorkspace(filePath),
      title: firstHeading(content) || path.basename(filePath),
      path: relativeToWorkspace(filePath),
      kind: "markdown" as const,
      words: countWords(content),
      updatedAt: fileStat.mtime.toISOString(),
      excerpt: summarize(content, 240)
    };
  }));
}

async function getSessionDocs() {
  const sessions = await getSessions(30);
  return sessions.filter((session) => session.messages.length > 0).map((session) => {
    const last = session.messages.at(-1);
    const first = session.messages.find((message) => message.role === "user");
    const text = last?.content ?? first?.content ?? "";
    return {
      id: session.id,
      title: `Session ${session.id.slice(0, 19)}`,
      path: `.agent/sessions/${session.id}.json`,
      kind: "session" as const,
      words: countWords(session.messages.map((message) => message.content).join(" ")),
      updatedAt: session.updatedAt,
      excerpt: summarize(text, 240)
    };
  });
}

async function findMarkdown(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (!target.startsWith(workspaceRoot)) continue;
    if (entry.isDirectory()) files.push(...await findMarkdown(target));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(target);
  }
  return files;
}

function firstHeading(content: string) {
  return content.split(/\r?\n/).find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim();
}

function countWords(content: string) {
  return content.trim().split(/\s+/).filter(Boolean).length;
}
