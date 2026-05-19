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
import { typecheckTool } from "./typecheck.js";
import { gitDiffTool, gitStatusTool } from "./gitStatus.js";
import { searchFilesTool } from "./searchFiles.js";
import { discordEnsureChannelsTool } from "./discordEnsureChannels.js";
import { discordRenameChannelTool } from "./discordRenameChannel.js";
import { projectChecksTool } from "./projectChecks.js";
import { devMemoryTool } from "./devMemory.js";
import { readSkillTool } from "./readSkill.js";
import { internshipRunDailyTool, internshipScanTool, internshipStatusTool } from "./internshipTools.js";

const tools = [
  readFileTool,
  writeFileTool,
  replaceInFileTool,
  applyPatchTool,
  listFilesTool,
  searchFilesTool,
  readSkillTool,
  typecheckTool,
  projectChecksTool,
  gitStatusTool,
  gitDiffTool,
  devMemoryTool,
  shellTool,
  gmailSearchTool,
  gmailReadTool,
  gmailCreateDraftTool,
  internshipStatusTool,
  internshipScanTool,
  internshipRunDailyTool,
  discordEnsureChannelsTool,
  discordRenameChannelTool,
  fetchUrlTool
];

export function getTool(name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name);
}

export function listTools(): Tool[] {
  return tools;
}
