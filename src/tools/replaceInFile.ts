import { readFile, writeFile } from "node:fs/promises";
import type { Tool } from "./types.js";
import { assertNotProtectedWorkspacePath, resolveInsideWorkspace } from "../utils/paths.js";

export const replaceInFileTool: Tool = {
  name: "replace_in_file",
  description: "Replace exact text inside a workspace file without rewriting the whole file.",
  risky: true,
  approvalPreview(input) {
    const path = String(input.path ?? "").trim() || "(missing path)";
    const find = summarizeText(String(input.find ?? ""));
    const replace = summarizeText(String(input.replace ?? ""));
    const replaceAll = input.replaceAll === true ? "true" : "false";
    return `Path: ${path}\nreplaceAll: ${replaceAll}\nFind:\n${find}\nReplace:\n${replace}`;
  },
  async run(input, context) {
    try {
      const filePath = String(input.path ?? "").trim();
      if (!filePath) {
        return { ok: false, content: "Missing required input: path" };
      }
      if (input.find === undefined) {
        return { ok: false, content: "Missing required input: find" };
      }
      if (input.replace === undefined) {
        return { ok: false, content: "Missing required input: replace" };
      }

      const find = String(input.find);
      const replace = String(input.replace);
      const replaceAll = input.replaceAll === true;
      const target = resolveInsideWorkspace(context.config.workspaceRoot, filePath);
      assertNotProtectedWorkspacePath(context.config.workspaceRoot, target);

      const original = await readFile(target, "utf8");
      const matchCount = countExactMatches(original, find);

      if (matchCount === 0) {
        return { ok: false, content: `No exact matches found in ${filePath}.` };
      }

      if (!replaceAll && matchCount > 1) {
        return {
          ok: false,
          content: `Found ${matchCount} matches in ${filePath}. Set replaceAll=true or make the search text more specific.`
        };
      }

      const next = replaceAll ? original.split(find).join(replace) : replaceFirst(original, find, replace);
      await writeFile(target, next, "utf8");

      const replacedCount = replaceAll ? matchCount : 1;
      return { ok: true, content: `Updated ${filePath} with ${replacedCount} replacement${replacedCount === 1 ? "" : "s"}.` };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { ok: false, content: "File does not exist." };
      }
      return { ok: false, content: error instanceof Error ? error.message : "Unable to replace text in file." };
    }
  }
};

function countExactMatches(content: string, search: string): number {
  if (!search) {
    return 0;
  }

  let count = 0;
  let index = 0;
  while (true) {
    index = content.indexOf(search, index);
    if (index === -1) {
      return count;
    }
    count += 1;
    index += search.length || 1;
  }
}

function replaceFirst(content: string, search: string, replacement: string): string {
  const index = content.indexOf(search);
  if (index === -1) {
    return content;
  }
  return `${content.slice(0, index)}${replacement}${content.slice(index + search.length)}`;
}

function summarizeText(value: string): string {
  if (!value) {
    return "(empty string)";
  }
  const clipped = value.length > 400 ? `${value.slice(0, 400)}\n...` : value;
  return clipped;
}
