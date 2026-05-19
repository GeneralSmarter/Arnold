import { readdir } from "node:fs/promises";
import type { Tool } from "./types.js";
import { isProtectedWorkspacePath, resolveInsideWorkspace } from "../utils/paths.js";

export const listFilesTool: Tool = {
  name: "list_files",
  description: "List files and folders inside the workspace.",
  risky: false,
  async run(input, context) {
    try {
      const dir = String(input.path ?? ".").trim() || ".";
      const target = resolveInsideWorkspace(context.config.workspaceRoot, dir);
      const entries = await readdir(target, { withFileTypes: true });
      const lines = entries
        .filter((entry) => !isProtectedWorkspacePath(context.config.workspaceRoot, `${target}/${entry.name}`))
        .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
        .sort();
      return { ok: true, content: lines.length ? lines.join("\n") : "(empty)" };
    } catch (error) {
      return { ok: false, content: errorMessage(error) };
    }
  }
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if ("code" in error && error.code === "ENOENT") {
      return "Directory does not exist.";
    }
    return error.message;
  }
  return "Unable to list files.";
}
