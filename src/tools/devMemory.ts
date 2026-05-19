import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { Tool } from "./types.js";
import { assertNotProtectedWorkspacePath, resolveInsideWorkspace } from "../utils/paths.js";

const DEFAULT_MEMORY_FILE = "HANDOFF.md";

export const devMemoryTool: Tool = {
  name: "dev_memory",
  description: "Append a concise self-development change note to HANDOFF.md or another workspace memory file.",
  risky: true,
  approvalPreview(input) {
    const filePath = String(input.path ?? DEFAULT_MEMORY_FILE).trim() || DEFAULT_MEMORY_FILE;
    const summary = String(input.summary ?? "").trim() || "(missing summary)";
    return `Append development memory to ${filePath}:\n${summary}`;
  },
  async run(input, context) {
    try {
      const filePath = String(input.path ?? DEFAULT_MEMORY_FILE).trim() || DEFAULT_MEMORY_FILE;
      const summary = String(input.summary ?? "").trim();
      if (!summary) {
        return { ok: false, content: "Missing required input: summary" };
      }

      const target = resolveInsideWorkspace(context.config.workspaceRoot, filePath);
      assertNotProtectedWorkspacePath(context.config.workspaceRoot, target);
      await ensureTextFileExists(target, filePath);

      const today = new Date().toISOString().slice(0, 10);
      const entry = [
        "",
        `### ${today} - Arnold Self-Development`,
        "",
        summary.trim(),
        ""
      ].join("\n");
      await appendFile(target, entry, "utf8");
      return { ok: true, content: `Appended development memory to ${filePath}` };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to append development memory." };
    }
  }
};

async function ensureTextFileExists(target: string, displayPath: string): Promise<void> {
  try {
    await readFile(target, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      if (path.basename(displayPath).toLowerCase() === displayPath.toLowerCase()) {
        return;
      }
      throw new Error(`Memory file does not exist: ${displayPath}`);
    }
    throw error;
  }
}
