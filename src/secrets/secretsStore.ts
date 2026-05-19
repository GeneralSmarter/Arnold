import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAgentDir } from "../config/config.js";

export interface SecretFile {
  google?: GoogleSecrets;
}

export interface GoogleSecrets {
  clientId?: string;
  clientSecret?: string;
  gmail?: GmailTokenSecrets;
}

export interface GmailTokenSecrets {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: string;
  obtainedAt?: string;
}

export class SecretsStore {
  private readonly secretsPath: string;

  constructor(private readonly workspaceRoot: string) {
    this.secretsPath = path.join(getAgentDir(workspaceRoot), "secrets.json");
  }

  path(): string {
    return this.secretsPath;
  }

  async load(): Promise<SecretFile> {
    try {
      const raw = await readFile(this.secretsPath, "utf8");
      return JSON.parse(raw) as SecretFile;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return {};
      }
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid secrets JSON at ${this.secretsPath}`);
      }
      throw error;
    }
  }

  async save(secrets: SecretFile): Promise<void> {
    await mkdir(path.dirname(this.secretsPath), { recursive: true });
    await writeFile(this.secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, "utf8");
  }

  async clearGmail(): Promise<void> {
    const secrets = await this.load();
    if (secrets.google) {
      delete secrets.google.gmail;
      await this.save(secrets);
      return;
    }
    await this.save(secrets);
  }

  async deleteAll(): Promise<void> {
    await rm(this.secretsPath, { force: true });
  }
}
