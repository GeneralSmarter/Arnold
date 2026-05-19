import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "./types.js";

const execAsync = promisify(exec);

export const shellTool: Tool = {
  name: "shell",
  description: "Run a shell command from the workspace root.",
  risky: true,
  async run(input, context) {
    const command = String(input.command ?? "").trim();
    if (!command) {
      return { ok: false, content: "Missing required input: command" };
    }

    try {
      const result = await execAsync(command, {
        cwd: context.config.workspaceRoot,
        timeout: 30_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      return { ok: true, content: output || "(command completed with no output)" };
    } catch (error) {
      if (error instanceof Error) {
        return { ok: false, content: error.message };
      }
      return { ok: false, content: "Shell command failed." };
    }
  }
};
