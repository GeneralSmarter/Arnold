import { readFile } from "node:fs/promises";
import type { Tool } from "./types.js";
import { assertNotProtectedWorkspacePath, resolveInsideWorkspace } from "../utils/paths.js";

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read a text file inside the workspace.",
  risky: false,
  async run(input, context) {
    try {
      const filePath = String(input.path ?? "").trim();
      if (!filePath) {
        return { ok: false, content: "Missing required input: path" };
      }
      const target = resolveInsideWorkspace(context.config.workspaceRoot, filePath);
      assertNotProtectedWorkspacePath(context.config.workspaceRoot, target);
      const content = await readFile(target, "utf8");
      return { ok: true, content };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { ok: false, content: "File does not exist." };
      }
      return { ok: false, content: error instanceof Error ? error.message : "Unable to read file." };
    }
  }
};
