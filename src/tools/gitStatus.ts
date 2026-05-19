import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "./types.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export const gitStatusTool: Tool = {
  name: "git_status",
  description: "Show concise git status for the workspace.",
  risky: false,
  async run(_input, context) {
    try {
      const result = await execAsync("git status --short --branch", {
        cwd: context.config.workspaceRoot,
        timeout: 30_000,
        windowsHide: true,
        maxBuffer: 256 * 1024
      });
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      return { ok: true, content: output || "Working tree is clean." };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to read git status." };
    }
  }
};

export const gitDiffTool: Tool = {
  name: "git_diff",
  description: "Show the current workspace git diff, optionally scoped to one path.",
  risky: false,
  async run(input, context) {
    const path = String(input.path ?? "").trim();
    const args = path ? ["diff", "--", path] : ["diff", "--"];

    try {
      const result = await execFileAsync("git", args, {
        cwd: context.config.workspaceRoot,
        timeout: 30_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      return { ok: true, content: output || "No diff." };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to read git diff." };
    }
  }
};
