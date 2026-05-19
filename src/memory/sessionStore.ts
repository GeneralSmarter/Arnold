import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Session } from "../agent/types.js";
import type { AppConfig } from "../config/config.js";
import { getAgentDir } from "../config/config.js";

export class SessionStore {
  private readonly sessionsDir: string;

  constructor(private readonly workspaceRoot: string) {
    this.sessionsDir = path.join(getAgentDir(workspaceRoot), "sessions");
  }

  async create(config: AppConfig): Promise<Session> {
    const now = new Date().toISOString();
    return {
      id: makeSessionId(),
      createdAt: now,
      updatedAt: now,
      messages: [],
      provider: config.provider,
      workspaceRoot: config.workspaceRoot
    };
  }

  async save(session: Session): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
    session.updatedAt = new Date().toISOString();
    await writeFile(this.pathFor(session.id), `${JSON.stringify(session, null, 2)}\n`, "utf8");
  }

  async loadLatest(): Promise<Session | undefined> {
    await mkdir(this.sessionsDir, { recursive: true });
    const files = (await readdir(this.sessionsDir))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .reverse();
    if (!files[0]) {
      return undefined;
    }
    const raw = await readFile(path.join(this.sessionsDir, files[0]), "utf8");
    return JSON.parse(raw) as Session;
  }

  private pathFor(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }
}

function makeSessionId(): string {
  const safeTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${safeTimestamp}-${suffix}`;
}
