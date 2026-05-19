import type { Tool } from "./types.js";
import { readFileTool } from "./readFile.js";
import { writeFileTool } from "./writeFile.js";
import { listFilesTool } from "./listFiles.js";
import { shellTool } from "./shell.js";
import { gmailSearchTool } from "./gmailSearch.js";
import { gmailReadTool } from "./gmailRead.js";
import { gmailCreateDraftTool } from "./gmailCreateDraft.js";
import { fetchUrlTool } from "./fetchUrl.js";
import { replaceInFileTool } from "./replaceInFile.js";
import { applyPatchTool } from "./applyPatch.js";

const tools = [
  readFileTool,
  writeFileTool,
  replaceInFileTool,
  applyPatchTool,
  listFilesTool,
  shellTool,
  gmailSearchTool,
  gmailReadTool,
  gmailCreateDraftTool,
  fetchUrlTool
];

export function getTool(name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name);
}

export function listTools(): Tool[] {
  return tools;
}
