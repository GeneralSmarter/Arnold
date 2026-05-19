import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "./types.js";

const execAsync = promisify(exec);

export const typecheckTool: Tool = {
  name: "typecheck",
  description: "Run the project's TypeScript typecheck script and return the result.",
  risky: false,
  async run(_input, context) {
    try {
      const result = await execAsync("npm run typecheck", {
        cwd: context.config.workspaceRoot,
        timeout: 120_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      return { ok: true, content: output || "Typecheck passed." };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Typecheck failed." };
    }
  }
};
