import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Tool } from "../tools/types.js";

export async function askForApproval(
  tool: Tool,
  toolInput: Record<string, unknown>,
  workspaceRoot: string
): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    console.log(`\nApproval required for tool: ${tool.name}`);
    console.log(`Workspace: ${workspaceRoot}`);
    const preview = tool.approvalPreview?.(toolInput) ?? JSON.stringify(toolInput, null, 2);
    console.log(`Input:\n${preview}`);
    const answer = await rl.question("Run this action? y/N ");
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}
