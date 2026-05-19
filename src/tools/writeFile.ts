import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Tool } from "./types.js";
import { assertNotProtectedWorkspacePath, resolveInsideWorkspace } from "../utils/paths.js";

export const writeFileTool: Tool = {
  name: "write_file",
  description: "Write a full text file inside the workspace. Prefer incremental edit tools when possible.",
  risky: true,
  async run(input, context) {
    try {
      const filePath = String(input.path ?? "").trim();
      if (!filePath) {
        return { ok: false, content: "Missing required input: path" };
      }
      if (input.content === undefined) {
        return { ok: false, content: "Missing required input: content" };
      }
      const content = String(input.content);
      const target = resolveInsideWorkspace(context.config.workspaceRoot, filePath);
      assertNotProtectedWorkspacePath(context.config.workspaceRoot, target);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
      return { ok: true, content: `Wrote ${filePath}` };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to write file." };
    }
  }
};
