import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { agentDir } from "./workspace";

export interface SessionMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  name?: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  messages: SessionMessage[];
}

export interface ActivityEvent {
  id: string;
  sessionId: string;
  title: string;
  summary: string;
  status: "done" | "in-progress" | "error";
  toolCount: number;
  updatedAt: string;
  source: string;
}

const sessionsDir = path.join(agentDir, "sessions");

export async function getSessions(limit = 40): Promise<SessionRecord[]> {
  try {
    const files = await readdir(sessionsDir);
    const stats = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => ({ file, fileStat: await stat(path.join(sessionsDir, file)) }))
    );

    const newest = stats.sort((a, b) => b.fileStat.mtimeMs - a.fileStat.mtimeMs).slice(0, limit);
    const sessions = await Promise.all(
      newest.map(async ({ file }) => JSON.parse(await readFile(path.join(sessionsDir, file), "utf8")) as SessionRecord)
    );
    return sessions;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function getActivityEvents(limit = 24): Promise<ActivityEvent[]> {
  const sessions = await getSessions(limit);
  return sessions.map((session) => {
    const firstUser = session.messages.find((message) => message.role === "user");
    const last = session.messages.at(-1);
    const content = firstUser?.content ?? "Empty Arnold session";
    const title = extractTitle(content);
    const hasError = session.messages.some((message) => /error:|blocked|too many tool steps/i.test(message.content));
    const status = last?.role === "assistant" ? (hasError ? "error" : "done") : "in-progress";

    return {
      id: session.id,
      sessionId: session.id,
      title,
      summary: summarize(last?.content ?? content),
      status,
      toolCount: session.messages.filter((message) => message.role === "tool").length,
      updatedAt: session.updatedAt,
      source: "session"
    };
  });
}

function extractTitle(content: string) {
  const request = content.includes("User request:") ? content.split("User request:").pop() ?? content : content;
  return summarize(request, 72);
}

export function summarize(content: string, max = 180) {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}...` : flat || "(empty)";
}
