import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Tool } from "./types.js";
import { assertNotProtectedWorkspacePath, resolveInsideWorkspace } from "../utils/paths.js";

interface ParsedPatch {
  files: FilePatch[];
}

interface FilePatch {
  oldPath: string | null;
  newPath: string | null;
  hunks: Hunk[];
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: HunkLine[];
}

interface HunkLine {
  type: "context" | "delete" | "add";
  text: string;
}

export const applyPatchTool: Tool = {
  name: "apply_patch",
  description: "Apply a conservative unified-style text patch inside the workspace.",
  risky: true,
  approvalPreview(input) {
    const patch = String(input.patch ?? "").trim();
    if (!patch) {
      return "Patch: (missing patch)";
    }
    const lines = patch.split(/\r?\n/).slice(0, 80);
    return lines.join("\n");
  },
  async run(input, context) {
    const patchText = String(input.patch ?? "");
    if (!patchText.trim()) {
      return { ok: false, content: "Missing required input: patch" };
    }

    try {
      const parsed = parsePatch(patchText);
      for (const filePatch of parsed.files) {
        await applyFilePatch(filePatch, context.config.workspaceRoot);
      }
      return { ok: true, content: `Applied patch to ${parsed.files.length} file${parsed.files.length === 1 ? "" : "s"}.` };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to apply patch." };
    }
  }
};

async function applyFilePatch(filePatch: FilePatch, workspaceRoot: string): Promise<void> {
  if (filePatch.oldPath && filePatch.newPath && filePatch.oldPath !== filePatch.newPath) {
    throw new Error(`Renames are not supported in v1: ${filePatch.oldPath} -> ${filePatch.newPath}`);
  }

  if (!filePatch.oldPath && !filePatch.newPath) {
    throw new Error("Patch file entry is missing both old and new paths.");
  }

  const targetPath = filePatch.newPath ?? filePatch.oldPath;
  if (!targetPath) {
    throw new Error("Patch file entry did not resolve to a target path.");
  }

  const target = resolveInsideWorkspace(workspaceRoot, targetPath);
  assertNotProtectedWorkspacePath(workspaceRoot, target);

  if (filePatch.oldPath === null && filePatch.newPath) {
    const created = applyHunks("", filePatch.hunks, filePatch.newPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, created, "utf8");
    return;
  }

  if (filePatch.newPath === null && filePatch.oldPath) {
    const current = await readExistingText(target, filePatch.oldPath);
    applyHunks(current, filePatch.hunks, filePatch.oldPath);
    await rm(target);
    return;
  }

  const current = await readExistingText(target, targetPath);
  const next = applyHunks(current, filePatch.hunks, targetPath);
  await writeFile(target, next, "utf8");
}

async function readExistingText(target: string, displayPath: string): Promise<string> {
  try {
    return await readFile(target, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`File does not exist: ${displayPath}`);
    }
    throw error;
  }
}

function applyHunks(content: string, hunks: Hunk[], displayPath: string): string {
  const eol = detectEol(content);
  const hadTrailingNewline = hasTrailingNewline(content);
  const originalLines = splitLines(content);
  const result: string[] = [];
  let sourceIndex = 0;

  for (const hunk of hunks) {
    const expectedIndex = Math.max(hunk.oldStart - 1, 0);
    if (expectedIndex < sourceIndex) {
      throw new Error(`Overlapping patch hunks for ${displayPath}.`);
    }

    result.push(...originalLines.slice(sourceIndex, expectedIndex));
    let hunkIndex = expectedIndex;

    for (const line of hunk.lines) {
      if (line.type === "context") {
        const current = originalLines[hunkIndex];
        if (current !== line.text) {
          throw new Error(`Patch context mismatch in ${displayPath} at line ${hunkIndex + 1}.`);
        }
        result.push(current);
        hunkIndex += 1;
        continue;
      }

      if (line.type === "delete") {
        const current = originalLines[hunkIndex];
        if (current !== line.text) {
          throw new Error(`Patch delete mismatch in ${displayPath} at line ${hunkIndex + 1}.`);
        }
        hunkIndex += 1;
        continue;
      }

      result.push(line.text);
    }

    const consumed = countConsumedOldLines(hunk);
    if (hunkIndex !== expectedIndex + consumed) {
      throw new Error(`Patch hunk size mismatch in ${displayPath}.`);
    }

    sourceIndex = hunkIndex;
  }

  result.push(...originalLines.slice(sourceIndex));
  const next = result.join(eol);
  const shouldHaveTrailingNewline = decideTrailingNewline(content, hunks, hadTrailingNewline);
  return shouldHaveTrailingNewline ? `${next}${eol}` : next;
}

function decideTrailingNewline(original: string, hunks: Hunk[], hadTrailingNewline: boolean): boolean {
  if (!original) {
    return true;
  }

  const lastMeaningfulLine = [...hunks]
    .reverse()
    .flatMap((hunk) => [...hunk.lines].reverse())
    .find((line) => line.type !== "delete");

  if (!lastMeaningfulLine) {
    return hadTrailingNewline;
  }

  return hadTrailingNewline;
}

function countConsumedOldLines(hunk: Hunk): number {
  return hunk.lines.filter((line) => line.type !== "add").length;
}

function detectEol(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function hasTrailingNewline(content: string): boolean {
  return content.endsWith("\n") || content.endsWith("\r\n");
}

function splitLines(content: string): string[] {
  if (!content) {
    return [];
  }

  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) {
    lines.pop();
  }
  return lines;
}

function parsePatch(patch: string): ParsedPatch {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const files: FilePatch[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line) {
      index += 1;
      continue;
    }

    if (!line.startsWith("--- ")) {
      throw new Error(`Malformed patch: expected "--- " at line ${index + 1}.`);
    }

    const oldPath = parsePatchPath(line.slice(4).trim());
    index += 1;
    if (index >= lines.length || !lines[index].startsWith("+++ ")) {
      throw new Error(`Malformed patch: expected "+++ " after line ${index}.`);
    }

    const newPath = parsePatchPath(lines[index].slice(4).trim());
    index += 1;

    const hunks: Hunk[] = [];
    while (index < lines.length) {
      const nextLine = lines[index];
      if (!nextLine) {
        index += 1;
        continue;
      }
      if (nextLine.startsWith("--- ")) {
        break;
      }
      if (!nextLine.startsWith("@@")) {
        throw new Error(`Malformed patch: expected hunk header at line ${index + 1}.`);
      }

      const header = nextLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*$/);
      if (!header) {
        throw new Error(`Malformed patch hunk header at line ${index + 1}.`);
      }

      const hunk: Hunk = {
        oldStart: Number(header[1]),
        oldCount: Number(header[2] ?? "1"),
        newStart: Number(header[3]),
        newCount: Number(header[4] ?? "1"),
        lines: []
      };

      index += 1;
      while (index < lines.length) {
        const hunkLine = lines[index];
        if (hunkLine.startsWith("@@") || hunkLine.startsWith("--- ")) {
          break;
        }
        if (hunkLine === "\\ No newline at end of file") {
          index += 1;
          continue;
        }

        const marker = hunkLine[0];
        const text = hunkLine.slice(1);
        if (marker === " ") {
          hunk.lines.push({ type: "context", text });
        } else if (marker === "-") {
          hunk.lines.push({ type: "delete", text });
        } else if (marker === "+") {
          hunk.lines.push({ type: "add", text });
        } else {
          throw new Error(`Malformed patch line at ${index + 1}.`);
        }
        index += 1;
      }

      validateHunkCounts(hunk);
      hunks.push(hunk);
    }

    if (hunks.length === 0) {
      throw new Error(`Patch for ${newPath ?? oldPath ?? "unknown file"} did not include any hunks.`);
    }

    files.push({ oldPath, newPath, hunks });
  }

  if (files.length === 0) {
    throw new Error("Patch did not include any file changes.");
  }

  return { files };
}

function parsePatchPath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Patch path was empty.");
  }
  if (trimmed === "/dev/null") {
    return null;
  }

  const withoutPrefix = trimmed.replace(/^[ab]\//, "");
  if (!withoutPrefix || withoutPrefix === trimmed && trimmed.includes("\t")) {
    throw new Error(`Unsupported patch path: ${value}`);
  }
  return withoutPrefix;
}

function validateHunkCounts(hunk: Hunk): void {
  const oldLines = hunk.lines.filter((line) => line.type !== "add").length;
  const newLines = hunk.lines.filter((line) => line.type !== "delete").length;
  if (oldLines !== hunk.oldCount) {
    throw new Error(`Patch hunk expected ${hunk.oldCount} old lines but found ${oldLines}.`);
  }
  if (newLines !== hunk.newCount) {
    throw new Error(`Patch hunk expected ${hunk.newCount} new lines but found ${newLines}.`);
  }
}
